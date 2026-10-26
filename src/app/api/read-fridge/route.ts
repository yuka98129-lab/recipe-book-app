import Anthropic from "@anthropic-ai/sdk";
import { authenticate, createRateLimiter, fail } from "../../../lib/api-guard";
import { MAX_FRIDGE_IMAGES, readFridge } from "../../../lib/fridge-reader";
import { DEFAULT_MODEL, ReadError } from "../../../lib/recipe-reader";

// 冷蔵庫の写真から、材料を読み取る(サーバー側)。
// 鍵はサーバーだけで使い、ログイン中の本人だけが使える。写真は、読み取りに使うだけで、保存しない。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_CHARS = 2_500_000; // 画像1枚あたり(base64の文字数)

/** 1人あたり、10分で20回まで */
const overLimit = createRateLimiter(20, 10 * 60 * 1000);

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(503, "not_configured", "読み取りの設定がまだ終わっていません(ANTHROPIC_API_KEY)。");
  }
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (overLimit(auth.userId)) {
    return fail(429, "rate_limited", "読み取りの回数が多すぎます。少し待ってから、もう一度試してください。");
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
  if (typeof body !== "object" || body === null) return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  const images = (body as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return fail(400, "no_input", "冷蔵庫の写真を選んでください。");
  if (images.length > MAX_FRIDGE_IMAGES) {
    return fail(400, "too_many_images", `写真は、1回に${MAX_FRIDGE_IMAGES}枚までです。`);
  }
  if (images.some((i) => typeof i !== "string" || i.length > MAX_IMAGE_CHARS)) {
    return fail(413, "too_large", "写真のサイズが大きすぎます。");
  }

  try {
    const reading = await readFridge(new Anthropic({ apiKey }), images as string[], process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
    return Response.json(reading);
  } catch (err) {
    if (err instanceof ReadError) return fail(422, "read_failed", err.message);
    console.error("read-fridge failed:", err instanceof Error ? err.message : "unknown error");
    return fail(502, "ai_error", "AIの読み取りでエラーが出ました。時間をおいて、もう一度試してください。");
  }
}
