import type { Ingredient } from "./types";

// 分量の文字(「3個」「大さじ1/2」「1と1/2カップ」「200g」)を読んで、人数に合わせて計算し直す。
// 「適量」「少々」のように、数字がないものは、そのまま。

const NUM = String.raw`\d+(?:\.\d+)?\s*と\s*\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?`;
const RANGE = String.raw`(?:${NUM})(?:\s*[〜~～\-–]\s*(?:${NUM}))?`;
// 数字のあとに付く単位(長いものを先に)。cm・mm・分・度などの「量ではない数字」は、含めない
const UNIT_AFTER = String.raw`kg|ml|mL|cc|g|L|ℓ|切れ|パック|かけ|カップ|個|本|枚|片|袋|缶|束|株|房|玉|丁|合|杯|尾|匹|羽|粒|滴|把|斤|膳`;
// 数字の前に付く単位
const UNIT_BEFORE = String.raw`大さじ|小さじ|カップ|cup`;

const TOKEN = new RegExp(
  [
    String.raw`(?<hb>${UNIT_BEFORE})(?<sb>\s*)(?<nb>${RANGE})`, // 大さじ1/2
    String.raw`(?<na>${RANGE})(?<sa>\s*)(?<ua>${UNIT_AFTER})`, // 200g, 1と1/2カップ
    String.raw`半(?<uh>分|個|本|玉|袋|缶|束|株|パック|片|枚)`, // 半分
  ].join("|"),
  "g",
);

const FRACTIONS: [number, string][] = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
];

/** 「1と1/2」「1/2」「2.5」「3」を、数にする */
function parseNum(s: string): number {
  const t = s.replace(/\s+/g, "");
  const mixed = /^(\d+(?:\.\d+)?)と(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t);
}

/** 数を、人が読みやすい形にする(1と1/2、0.5 より 1/2)。g・ml などの重さ・かさは、きりのよい数に丸める */
export function formatAmount(v: number, metric: boolean): string {
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (metric) {
    if (v >= 100) return String(Math.round(v / 5) * 5);
    if (v >= 10) return String(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }
  const whole = Math.floor(v + 1e-9);
  const rest = v - whole;
  if (rest < 0.04) return String(whole);
  if (rest > 0.96) return String(whole + 1);
  const near = FRACTIONS.reduce((a, b) => (Math.abs(b[0] - rest) < Math.abs(a[0] - rest) ? b : a));
  if (Math.abs(near[0] - rest) <= 0.04) return whole > 0 ? `${whole}と${near[1]}` : near[1];
  return String(Math.round(v * 10) / 10);
}

const isMetric = (unit: string) => /^(kg|ml|mL|cc|g|L|ℓ)$/.test(unit);

function scaleRange(range: string, factor: number, metric: boolean): string {
  return range.replace(new RegExp(NUM, "g"), (n) => formatAmount(parseNum(n) * factor, metric));
}

/** 分量の文字を、factor 倍にする(factor=1 なら、そのまま返す) */
export function scaleQuantity(text: string, factor: number): string {
  if (!(factor > 0) || !Number.isFinite(factor) || factor === 1) return text;
  const t = text.normalize("NFKC");
  return t.replace(TOKEN, (match, ...args) => {
    const g = args[args.length - 1] as Record<string, string | undefined>;
    if (g.hb !== undefined) return `${g.hb}${g.sb ?? ""}${scaleRange(g.nb!, factor, false)}`;
    if (g.na !== undefined) return `${scaleRange(g.na, factor, isMetric(g.ua!))}${g.sa ?? ""}${g.ua}`;
    if (g.uh !== undefined) {
      const unit = g.uh === "分" ? "" : g.uh;
      return `${formatAmount(0.5 * factor, false)}${unit}`;
    }
    return match;
  });
}

/** 数字を読み取れる分量か(「適量」「少々」は false)。画面で「計算しました」の注意を出すかの判断に使う */
export function hasScalableAmount(text: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text.normalize("NFKC"));
}

export const scaleIngredient = (i: Ingredient, factor: number): Ingredient => ({ ...i, quantity: scaleQuantity(i.quantity, factor) });
