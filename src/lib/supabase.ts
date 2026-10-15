import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_ の値はビルド時にコードへ埋め込まれる。process.env[変数名] のような書き方だと埋め込まれないので、
// 下のように名前をそのまま書くこと。
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

/** 同期の設定(環境変数)が入っているか。入っていなければ、これまで通りブラウザ内だけで動く */
export const isSyncConfigured = () => Boolean(URL && KEY);

/** Supabase への接続。設定がない・サーバー側で呼ばれたときは null */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !URL || !KEY) return null;
  if (client === undefined) {
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
