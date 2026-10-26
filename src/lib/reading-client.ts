import { cleanReading, MAX_NAMES, needsReading } from "./reading";
import { ReadRequestError } from "./recipe-reader-client";
import { setReadings } from "./recipe-store";
import { getSupabase } from "./supabase";
import type { Recipe } from "./types";

// ブラウザ側:料理名(と id)だけをサーバー(/api/readings)へ送り、よみがなを受け取る。

export async function requestReadings(items: { id: string; name: string }[]): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new ReadRequestError("よみがなを入れるには、ログインが必要です。");

  let res: Response;
  try {
    res = await fetch("/api/readings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    });
  } catch {
    throw new ReadRequestError("通信できませんでした。ネットワークを確認して、もう一度試してください。");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "よみがなを入れられませんでした。";
    throw new ReadRequestError(message);
  }
  const rows = (body as { items?: unknown } | null)?.items;
  const out: Record<string, string> = {};
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const { id, reading } = (row ?? {}) as { id?: unknown; reading?: unknown };
      const clean = cleanReading(reading);
      if (typeof id === "string" && clean) out[id] = clean;
    }
  }
  return out;
}

/** よみがながない料理に、まとめてよみがなを入れて保存する。入れられた件数を返す(途中で失敗しても、入れた分は残る) */
export async function fillMissingReadings(recipes: Recipe[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const targets = recipes.filter(needsReading).map((r) => ({ id: r.id, name: r.name }));
  let filled = 0;
  for (let i = 0; i < targets.length; i += MAX_NAMES) {
    const got = await requestReadings(targets.slice(i, i + MAX_NAMES));
    setReadings(got);
    filled += Object.keys(got).length;
    onProgress?.(Math.min(i + MAX_NAMES, targets.length), targets.length);
  }
  return filled;
}

/** 登録のときに、料理名1つのよみがなを、AIに付けてもらう。失敗・時間切れ(6秒)は "" を返すだけ(保存は止めない) */
export async function autoReading(name: string): Promise<string> {
  try {
    const got = await Promise.race([
      requestReadings([{ id: "x", name }]),
      new Promise<Record<string, string>>((resolve) => setTimeout(() => resolve({}), 6000)),
    ]);
    return got.x ?? "";
  } catch {
    return "";
  }
}
