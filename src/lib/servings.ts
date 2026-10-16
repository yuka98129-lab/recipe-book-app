// 何人分の材料か。レシピに1つ、任意で付ける。

/** 入力できる上限(人分) */
export const MAX_SERVINGS = 100;

/** 1〜100 の整数か */
export function isServings(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_SERVINGS;
}

/** フォームの入力文字を、人数の数値にする。空欄は undefined(未入力)、正しくない値は null。「2人分」のような書き方も受け付ける */
export function parseServings(text: string): number | undefined | null {
  const t = text.normalize("NFKC").trim().replace(/人分$/, "").trim();
  if (t === "") return undefined;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return isServings(n) ? n : null;
}

/** 表示用。2 → 「2人分」 */
export const formatServings = (n: number) => `${n}人分`;
