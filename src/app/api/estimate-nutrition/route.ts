import Anthropic from "@anthropic-ai/sdk";
import { authenticate, createRateLimiter, fail } from "../../../lib/api-guard";
import { DEFAULT_MODEL, ReadError } from "../../../lib/recipe-reader";
import { estimateNutrition, type NutritionInput } from "../../../lib/recipe-nutrition";

// 材料と分量(と、あれば完成写真)から、栄養素を推定する(サーバー側)。
// 鍵はサーバーだけで使い、ログイン中の本人だけが使える。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_CHARS = 2_500_000;
const MAX_ROWS = 80;

/** 1人あたり、10分で20回まで */
const overLimit = createRateLimiter(20, 10 * 60 * 1000);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 受け取った材料の表を整える。名前のない行は捨て、合計の行数を制限する */
function parseGroups(v: unknown): NutritionInput["groups"] {
  if (!Array.isArray(v)) return [];
  const groups: NutritionInput["groups"] = [];
  let count = 0;
  for (const g of v.slice(0, 20)) {
    if (!isRecord(g) || !Array.isArray(g.rows)) continue;
    const rows = [];
    for (const r of g.rows) {
      if (!isRecord(r)) continue;
      const name = text(r.name, 80);
      if (!name) continue;
      rows.push({ name, quantity: text(r.quantity, 40) });
      if (++count >= MAX_ROWS) break;
    }
    groups.push({ title: text(g.title, 40) || "材料", rows });
    if (count >= MAX_ROWS) break;
  }
  return groups;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(503, "not_configured", "推定の設定がまだ終わっていません(ANTHROPIC_API_KEY)。");
  }
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (overLimit(auth.userId)) {
    return fail(429, "rate_limited", "推定の回数が多すぎます。少し待ってから、もう一度試してください。");
  }

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return fail(413, "too_large", "写真のサイズが大きすぎます。");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  }
  if (!isRecord(body)) return fail(400, "bad_request", "リクエストの形式が正しくありません。");

  const image = body.image === undefined || body.image === null ? null : body.image;
  if (image !== null && (typeof image !== "string" || image.length > MAX_IMAGE_CHARS)) {
    return fail(413, "too_large", "写真のサイズが大きすぎます。");
  }
  const groups = parseGroups(body.groups);
  if (groups.every((g) => g.rows.length === 0)) {
    return fail(400, "no_input", "材料が入っていないので、推定できません。");
  }

  try {
    const result = await estimateNutrition(
      new Anthropic({ apiKey }),
      { name: text(body.name, 100), groups, image },
      process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof ReadError) return fail(422, "read_failed", err.message);
    console.error("estimate-nutrition failed:", err instanceof Error ? err.message : "unknown error");
    return fail(502, "ai_error", "AIの推定でエラーが出ました。時間をおいて、もう一度試してください。");
  }
}
