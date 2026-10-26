import type { Recipe } from "./types";

// 料理名の「よみがな」と、あいうえお順(あ行・か行…)の並べ替え。
// 漢字の名前(親子丼)は、よみがながないと、あいうえお順にできないので、よみがなを別に持つ。

export const MAX_READING = 60;
/** AIに、1回で、よみがなを付けてもらう料理の数の上限 */
export const MAX_NAMES = 40;

/** カタカナをひらがなに、全角・半角をそろえる(空白は取る) */
export function toHiragana(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/ヴ/g, "ゔ");
}

const KANA_ONLY = /^[ぁ-ゖー・]+$/;

/** ひらがな(カタカナ・ー・中点も可)だけでできた名前か */
export function isKanaOnly(s: string): boolean {
  const h = toHiragana(s);
  return h.length > 0 && KANA_ONLY.test(h);
}

/** よみがなを整える。ひらがなだけの形にできなければ ""(壊れた値・漢字まじりは捨てる) */
export function cleanReading(v: unknown): string {
  if (typeof v !== "string") return "";
  const h = toHiragana(v).replace(/・/g, "");
  return h.length > 0 && h.length <= MAX_READING && /^[ぁ-ゖー]+$/.test(h) ? h : "";
}

/** 並べ替えに使う読み。よみがながあればそれ、なければ、ひらがな・カタカナだけの名前はそのまま。漢字まじりで、よみがながなければ "" */
export function readingOf(r: Pick<Recipe, "name" | "reading">): string {
  const given = cleanReading(r.reading);
  if (given) return given;
  return isKanaOnly(r.name) ? cleanReading(toHiragana(r.name).replace(/・/g, "")) : "";
}

export const GYOU = ["あ行", "か行", "さ行", "た行", "な行", "は行", "ま行", "や行", "ら行", "わ行"] as const;
export const OTHER = "その他";
export type Gyou = (typeof GYOU)[number] | typeof OTHER;

const ROWS: Record<string, string> = {
  あ: "ぁあぃいぅうゔぇえぉお",
  か: "かがきぎくぐけげこご",
  さ: "さざしじすずせぜそぞ",
  た: "ただちぢっつづてでとど",
  な: "なにぬねの",
  は: "はばぱひびぴふぶぷへべぺほぼぽ",
  ま: "まみむめも",
  や: "ゃやゅゆょよ",
  ら: "らりるれろ",
  わ: "ゎわゐゑをん",
};
const ROW_OF = new Map<string, Gyou>();
for (const [head, chars] of Object.entries(ROWS)) for (const c of chars) ROW_OF.set(c, `${head}行` as Gyou);

/** よみがなの1文字目から、何行か(長音「ー」で始まるときは、次の文字を見る) */
export function gyouOf(reading: string): Gyou {
  const first = [...reading].find((c) => c !== "ー");
  return (first && ROW_OF.get(first)) || OTHER;
}

const collator = new Intl.Collator("ja");

/** あいうえお順(読みがない料理は、最後に、料理名の順) */
export function compareRecipes(a: Recipe, b: Recipe): number {
  const ra = readingOf(a);
  const rb = readingOf(b);
  if (ra && rb) return collator.compare(ra, rb) || collator.compare(a.name, b.name);
  if (ra) return -1;
  if (rb) return 1;
  return collator.compare(a.name, b.name);
}

export type RecipeGroup = { gyou: Gyou; recipes: Recipe[] };

/** あ行〜わ行、その他 の順に、まとめる(料理がない行は出さない) */
export function groupByGyou(recipes: Recipe[]): RecipeGroup[] {
  const sorted = [...recipes].sort(compareRecipes);
  const map = new Map<Gyou, Recipe[]>();
  for (const r of sorted) {
    const g = gyouOf(readingOf(r));
    map.set(g, [...(map.get(g) ?? []), r]);
  }
  return ([...GYOU, OTHER] as Gyou[]).filter((g) => map.has(g)).map((g) => ({ gyou: g, recipes: map.get(g)! }));
}

/** よみがなが必要(漢字まじりで、よみがなが空)の料理 */
export const needsReading = (r: Pick<Recipe, "name" | "reading">): boolean => readingOf(r) === "";
