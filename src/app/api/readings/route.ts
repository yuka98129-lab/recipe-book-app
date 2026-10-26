import Anthropic from "@anthropic-ai/sdk";
import { authenticate, createRateLimiter, fail } from "../../../lib/api-guard";
import { DEFAULT_MODEL, ReadError } from "../../../lib/recipe-reader";
import { MAX_NAMES } from "../../../lib/reading";
import { fetchReadings, type ReadingInput } from "../../../lib/recipe-reading";

// 料理名のよみがなを、AIに付けさせる(サーバー側)。
// 鍵はサーバーだけで使い、ログイン中の本人だけが使える。送るのは、料理名とIDだけ(材料・手順・写真は送らない)。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;

/** 1人あたり、10分で20回まで(1回で40件まで) */
const overLimit = createRateLimiter(20, 10 * 60 * 1000);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseItems(v: unknown): ReadingInput[] {
  if (!Array.isArray(v)) return [];
  const out: ReadingInput[] = [];
  const seen = new Set<string>();
  for (const row of v) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
    // タブ・改行は、AIへの区切りを壊すので、空白に直す
    const name = typeof row.name === "string" ? row.name.replace(/[\t\r\n]+/g, " ").trim().slice(0, 100) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(503, "not_configured", "よみがなの設定がまだ終わっていません(ANTHROPIC_API_KEY)。");
  }
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (overLimit(auth.userId)) {
    return fail(429, "rate_limited", "回数が多すぎます。少し待ってから、もう一度試してください。");
  }
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return fail(413, "too_large", "送る料理が多すぎます。");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  }
  if (!isRecord(body)) return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  const items = parseItems(body.items);
  if (items.length === 0) return fail(400, "no_input", "料理名が入っていません。");

  try {
    const readings = await fetchReadings(new Anthropic({ apiKey }), items, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
    return Response.json({ items: readings });
  } catch (err) {
    if (err instanceof ReadError) return fail(422, "read_failed", err.message);
    console.error("readings failed:", err instanceof Error ? err.message : "unknown error");
    return fail(502, "ai_error", "AIでエラーが出ました。時間をおいて、もう一度試してください。");
  }
}
