// 調理時間(分)。レシピに1つ、任意で付ける。

/** 入力できる上限(分)。24時間 */
export const MAX_COOKING_MINUTES = 1440;

/** 1〜1440 の整数か */
export function isCookingMinutes(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_COOKING_MINUTES;
}

/** フォームの入力文字を、分の数値にする。空欄は undefined(未入力)、正しくない値は null */
export function parseCookingMinutes(text: string): number | undefined | null {
  // 全角の数字(１５ など)も受け付ける
  const t = text.normalize("NFKC").trim();
  if (t === "") return undefined;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return isCookingMinutes(n) ? n : null;
}

/** 表示用。45 → 「45分」、90 → 「1時間30分」、120 → 「2時間」 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
