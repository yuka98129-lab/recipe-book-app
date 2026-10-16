import { createClient } from "@supabase/supabase-js";

// API ルート(サーバー側)で共通の守り:ログインの確認と、回数の制限。

export const fail = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status });

/** 回数制限(サーバーが再起動すると数え直し。大まかな歯止め)。true なら制限を超えている */
export function createRateLimiter(limit: number, windowMs: number) {
  const calls = new Map<string, number[]>();
  return (userId: string, now = Date.now()): boolean => {
    const recent = (calls.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      calls.set(userId, recent);
      return true;
    }
    recent.push(now);
    calls.set(userId, recent);
    return false;
  };
}

/** Supabase のログイン情報(Authorization: Bearer ...)を確かめる。通れば userId、だめなら返すべき Response */
export async function authenticate(req: Request): Promise<{ userId: string } | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail(503, "not_configured", "サーバーの設定が終わっていません。");
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return fail(401, "unauthorized", "ログインが必要です。");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return fail(401, "unauthorized", "ログインが切れています。ログインし直してください。");
  return { userId: data.user.id };
}
