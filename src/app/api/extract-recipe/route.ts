import Anthropic from "@anthropic-ai/sdk";
import { authenticate, createRateLimiter, fail } from "../../../lib/api-guard";
import {
  MAX_READ_IMAGES,
  MAX_READ_TEXT_CHARS,
  MIN_READ_TEXT_CHARS,
} from "../../../lib/recipe-extract";
import { DEFAULT_MODEL, ReadError, readRecipe } from "../../../lib/recipe-reader";

// 写真・文章からレシピを読み取る(サーバー側)。
// - Claude API の鍵(ANTHROPIC_API_KEY)はここだけで使い、ブラウザには出さない
// - ログイン中の本人だけが使える(Supabase のログイン情報を、サーバーで確かめる)
// - 使いすぎを防ぐため、1人あたりの回数に上限をかける

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_CHARS = 2_500_000; // 画像1枚あたり(base64の文字数)
const MAX_CATEGORIES = 30;

/** 1人あたり、10分で20回まで */
const overLimit = createRateLimiter(20, 10 * 60 * 1000);

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(503, "not_configured", "読み取りの設定がまだ終わっていません(ANTHROPIC_API_KEY)。");
  }

  // --- ログインの確認 ---
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (overLimit(auth.userId)) {
    return fail(429, "rate_limited", "読み取りの回数が多すぎます。少し待ってから、もう一度試してください。");
  }

  // --- 入力の確認 ---
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return fail(413, "too_large", "写真のサイズが大きすぎます。");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  }
  if (typeof body !== "object" || body === null) return fail(400, "bad_request", "リクエストの形式が正しくありません。");
  const b = body as Record<string, unknown>;

  const images = Array.isArray(b.images) ? b.images : [];
  const text = typeof b.text === "string" ? b.text : "";
  const categories = Array.isArray(b.categories)
    ? b.categories.filter((c): c is string => typeof c === "string" && c.length <= 30).slice(0, MAX_CATEGORIES)
    : [];

  if (images.length > MAX_READ_IMAGES) {
    return fail(400, "too_many_images", `写真は、1回に${MAX_READ_IMAGES}枚までです。`);
  }
  if (images.some((i) => typeof i !== "string" || i.length > MAX_IMAGE_CHARS)) {
    return fail(413, "too_large", "写真のサイズが大きすぎます。");
  }
  if (text.length > MAX_READ_TEXT_CHARS) {
    return fail(400, "text_too_long", `文章は、${MAX_READ_TEXT_CHARS}文字までです。`);
  }
  if (images.length === 0 && text.trim().length < MIN_READ_TEXT_CHARS) {
    return fail(400, "no_input", "写真を選ぶか、レシピの文章を貼りつけてください。");
  }

  // --- 読み取り ---
  try {
    const client = new Anthropic({ apiKey });
    const recipe = await readRecipe(
      client,
      { images: images as string[], text, categories },
      process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    );
    return Response.json({ recipe });
  } catch (err) {
    if (err instanceof ReadError) return fail(422, "read_failed", err.message);
    // 詳細(鍵などが入る可能性)は、利用者に返さない。サーバーのログにだけ残す
    console.error("extract-recipe failed:", err instanceof Error ? err.message : "unknown error");
    return fail(502, "ai_error", "AIの読み取りでエラーが出ました。時間をおいて、もう一度試してください。");
  }
}
