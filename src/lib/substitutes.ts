import { covers } from "./fridge";
import { formatAmount, scaleQuantity } from "./quantity";
import { toHiragana } from "./reading";
import { DEFAULT_INDEX, type SynonymIndex } from "./synonyms";
import type { Recipe } from "./types";

// 材料が「ない時」の、代わりになるもの(代用)と、その分量。
// 分量は、もとの分量に対する割合(ratio)で持つ。どれも、よく知られた目安で、味見しながら調えてください。

export type SubPart = { name: string; ratio: number };
export type SubOption = { parts: SubPart[]; note?: string };
type Entry = { keys: string[]; options: SubOption[] };

/** 家に、いつもあるものとして扱う(代用の手持ち判定で、数えない) */
const STAPLES = ["水"];

const p = (name: string, ratio = 1): SubPart => ({ name, ratio });

export const SUBSTITUTES: Entry[] = [
  {
    keys: ["みりん", "本みりん", "みりん風調味料"],
    options: [
      { parts: [p("料理酒"), p("砂糖", 1 / 3)], note: "酒1に対して、砂糖は3分の1(大さじ1なら、小さじ1)" },
      { parts: [p("水"), p("砂糖", 1 / 3)], note: "お酒が、ない時。風味は、うすくなります" },
    ],
  },
  {
    keys: ["酒", "料理酒", "日本酒"],
    options: [
      { parts: [p("白ワイン")], note: "洋風の料理に向いています" },
      { parts: [p("みりん")], note: "甘くなるので、砂糖は、へらしてください" },
      { parts: [p("水")], note: "コクは、少し弱くなります" },
    ],
  },
  {
    keys: ["砂糖", "上白糖", "グラニュー糖", "三温糖"],
    options: [
      { parts: [p("はちみつ", 2 / 3)], note: "砂糖より甘いので、少なめで" },
      { parts: [p("みりん", 2)], note: "水分がふえるので、少し煮つめてください" },
    ],
  },
  {
    keys: ["醤油", "しょうゆ", "濃口醤油", "薄口醤油"],
    options: [
      { parts: [p("めんつゆ", 1.5)], note: "3倍濃縮のもの。甘みがあるので、砂糖やみりんは、へらしてください" },
      { parts: [p("白だし", 1.5)], note: "色は、うすくなります" },
    ],
  },
  {
    keys: ["酢", "お酢", "米酢", "穀物酢"],
    options: [{ parts: [p("レモン汁")], note: "さわやかな香りになります" }],
  },
  {
    keys: ["ポン酢", "ぽん酢"],
    options: [{ parts: [p("醤油", 0.5), p("レモン汁", 0.5)], note: "柑橘の果汁と醤油を、同じ量ずつ" }],
  },
  {
    keys: ["めんつゆ", "麺つゆ"],
    options: [{ parts: [p("醤油", 1 / 3), p("みりん", 1 / 3), p("水", 1)], note: "3倍濃縮のめんつゆの目安(水は、だしだと、もっとおいしい)" }],
  },
  {
    keys: ["片栗粉", "かたくり粉"],
    options: [
      { parts: [p("コーンスターチ")], note: "同じように、使えます" },
      { parts: [p("小麦粉", 2)], note: "水でよくといて、しっかり火を通します(ダマに注意)" },
    ],
  },
  {
    keys: ["薄力粉", "小麦粉"],
    options: [{ parts: [p("米粉")] }, { parts: [p("強力粉")], note: "かたく、なりやすいです" }],
  },
  {
    keys: ["牛乳"],
    options: [
      { parts: [p("豆乳")], note: "無調整のものが、おすすめ" },
      { parts: [p("生クリーム", 0.5), p("水", 0.5)], note: "コクが、出ます" },
    ],
  },
  {
    keys: ["生クリーム"],
    options: [{ parts: [p("牛乳")], note: "あっさりします。少し煮つめると、近くなります" }],
  },
  {
    keys: ["バター", "無塩バター", "有塩バター"],
    options: [
      { parts: [p("マーガリン")] },
      { parts: [p("サラダ油", 0.8)], note: "風味は、弱くなります" },
      { parts: [p("オリーブオイル", 0.8)], note: "風味が、変わります" },
    ],
  },
  {
    keys: ["サラダ油", "植物油", "油", "米油", "菜種油"],
    options: [{ parts: [p("オリーブオイル")], note: "香りが、出ます" }, { parts: [p("米油")] }],
  },
  {
    keys: ["ごま油", "胡麻油"],
    options: [{ parts: [p("サラダ油")], note: "香りは、弱くなります" }, { parts: [p("オリーブオイル")] }],
  },
  {
    keys: ["ウスターソース"],
    options: [{ parts: [p("中濃ソース")], note: "少し、とろみが出ます" }],
  },
  {
    keys: ["中濃ソース", "とんかつソース"],
    options: [{ parts: [p("ウスターソース")], note: "とろみは、弱くなります" }],
  },
  // 肉・野菜は、同じように使えるもの(分量は、もとと同じくらい)
  {
    keys: ["豚肉", "豚こま", "豚バラ", "豚ロース", "豚もも"],
    options: [{ parts: [p("鶏肉")], note: "あっさりします" }],
  },
  {
    keys: ["鶏肉", "鶏もも", "鶏むね", "とり肉"],
    options: [{ parts: [p("豚肉")], note: "コクが、出ます" }],
  },
  {
    keys: ["豚ひき肉"],
    options: [{ parts: [p("鶏ひき肉")] }, { parts: [p("合いびき肉")] }],
  },
  {
    keys: ["鶏ひき肉"],
    options: [{ parts: [p("豚ひき肉")] }],
  },
  {
    keys: ["キャベツ"],
    options: [{ parts: [p("白菜")], note: "やわらかく、水分が出ます" }],
  },
  {
    keys: ["白菜"],
    options: [{ parts: [p("キャベツ")], note: "少し、歯ごたえが出ます" }],
  },
  {
    keys: ["小松菜"],
    options: [{ parts: [p("ほうれん草")], note: "下ゆでが、いることがあります" }, { parts: [p("チンゲン菜")] }],
  },
  {
    keys: ["ほうれん草", "ほうれんそう"],
    options: [{ parts: [p("小松菜")], note: "アクが少なく、下ゆで不要です" }],
  },
  {
    keys: ["長ねぎ", "白ねぎ"],
    options: [{ parts: [p("玉ねぎ")], note: "甘みが、出ます" }, { parts: [p("青ねぎ")] }],
  },
  {
    keys: ["青ねぎ", "万能ねぎ", "小ねぎ"],
    options: [{ parts: [p("長ねぎ")], note: "辛みが、強めです" }],
  },
  {
    keys: ["玉ねぎ", "たまねぎ", "玉葱"],
    options: [{ parts: [p("長ねぎ")], note: "風味が、変わります" }],
  },
];

const norm = (s: string) => toHiragana(s.normalize("NFKC")).replace(/[\s　]+/g, "").toLowerCase();

/** 材料名に合う代用の表をさがす。1文字の言葉(酒・酢・油)は、まったく同じ時だけ。2文字以上は、ふくんでいれば合う */
export function findEntry(name: string): Entry | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = SUBSTITUTES.find((e) => e.keys.some((k) => norm(k) === n));
  if (exact) return exact;
  // ふくむ場合は、いちばん長い言葉に合うものを選ぶ(「みりん風調味料」→ みりん、「本みりん」→ みりん)
  let best: { e: Entry; len: number } | undefined;
  for (const e of SUBSTITUTES) {
    for (const k of e.keys) {
      const kk = norm(k);
      if (kk.length >= 2 && n.includes(kk) && (!best || kk.length > best.len)) best = { e, len: kk.length };
    }
  }
  return best?.e;
}

export type Substitution = {
  /** 「料理酒 ＋ 砂糖」 */
  label: string;
  /** 「料理酒 大さじ1 ＋ 砂糖 小さじ1」 */
  text: string;
  note?: string;
  /** 使う材料の名前 */
  partNames: string[];
};

type Measure = { ml: number; style: "spoon" | "cup" | "ml" };

/** 「大さじ2」「カップ1/2」「200ml」を、ml にする。読めなければ null */
function measureOf(quantity: string): Measure | null {
  const t = quantity.normalize("NFKC");
  const num = String.raw`(\d+(?:\.\d+)?\s*と\s*\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
  const read = (s: string) => {
    const x = s.replace(/\s+/g, "");
    const mixed = /^(\d+(?:\.\d+)?)と(\d+)\/(\d+)$/.exec(x);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const f = /^(\d+)\/(\d+)$/.exec(x);
    return f ? Number(f[1]) / Number(f[2]) : Number(x);
  };
  let m = new RegExp(String.raw`大さじ\s*${num}`).exec(t);
  if (m) return { ml: read(m[1]) * 15, style: "spoon" };
  m = new RegExp(String.raw`小さじ\s*${num}`).exec(t);
  if (m) return { ml: read(m[1]) * 5, style: "spoon" };
  m = new RegExp(String.raw`(?:カップ|cup)\s*${num}|${num}\s*カップ`).exec(t);
  if (m) return { ml: read(m[1] ?? m[2]) * 200, style: "cup" };
  m = new RegExp(String.raw`${num}\s*(?:ml|mL|cc)`).exec(t);
  if (m) return { ml: read(m[1]), style: "ml" };
  return null;
}

const isHalfStep = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 0.02;

function formatMeasure(ml: number, style: Measure["style"]): string {
  if (style === "ml") return `${formatAmount(ml, true)}ml`;
  if (style === "cup" && ml >= 50) return `カップ${formatAmount(ml / 200, false)}`;
  // 大さじで、きりのよい数(1・1/2・2…)になるときは大さじ。そうでなければ、小さじ。多いときは ml
  if (ml >= 7.5 && isHalfStep(ml / 15)) return `大さじ${formatAmount(ml / 15, false)}`;
  if (ml >= 60) return `${formatAmount(ml, true)}ml`;
  if (ml >= 15 && !isHalfStep(ml / 5)) return `大さじ${formatAmount(ml / 15, false)}`;
  return `小さじ${formatAmount(ml / 5, false)}`;
}

const hasDigit = (s: string) => /[0-9０-９]|半|[一二三四五六七八九十]/.test(s);

/** 代わりの材料1つぶんの分量(もとの分量・人数の倍率から) */
function amountFor(part: SubPart, quantity: string, factor: number): string {
  const q = quantity.normalize("NFKC");
  const m = measureOf(q);
  if (m) return formatMeasure(m.ml * factor * part.ratio, m.style);
  if (/\d\s*(kg|g)\b/.test(q)) return scaleQuantity(q, factor * part.ratio);
  if (!hasDigit(q)) return "適量";
  const r = factor * part.ratio;
  return Math.abs(r - 1) < 1e-9 ? "同じ量" : `${formatAmount(r, false)}倍の量`;
}

/** この材料(名前・分量)がない時の、代用の候補。人数を変えた時は factor で、分量も合わせる */
export function substitutesFor(name: string, quantity = "", factor = 1): Substitution[] {
  const entry = findEntry(name);
  if (!entry) return [];
  const f = factor > 0 && Number.isFinite(factor) ? factor : 1;
  return entry.options.map((o) => ({
    label: o.parts.map((x) => x.name).join(" ＋ "),
    text: o.parts.map((x) => `${x.name} ${amountFor(x, quantity, f)}`).join(" ＋ "),
    note: o.note,
    partNames: o.parts.map((x) => x.name),
  }));
}

/** 手持ちの材料で、ぜんぶそろう代用があれば、最初の1つを返す */
export function usableSubstitute(
  name: string,
  quantity: string,
  have: string[],
  synonyms: SynonymIndex = DEFAULT_INDEX,
  factor = 1,
): Substitution | null {
  // 代わりの材料が、もとの材料と同じもの(同義語)なら、代用にならない
  const subs = substitutesFor(name, quantity, factor).filter((s) => !s.partNames.some((n) => synonyms.same(n, name)));
  return (
    subs.find((s) => s.partNames.every((n) => STAPLES.includes(n) || covers(have, n, synonyms))) ?? null
  );
}

export type MissingSub = { name: string; sub: Substitution };

/** 冷蔵庫さがしの結果で、足りない材料のうち、手持ちで代用できるもの */
export function substitutesForMissing(
  recipe: Recipe,
  missing: string[],
  have: string[],
  synonyms: SynonymIndex = DEFAULT_INDEX,
): MissingSub[] {
  const all = [...recipe.ingredients, ...recipe.seasonings, ...recipe.extraGroups.flatMap((g) => g.items)];
  const out: MissingSub[] = [];
  for (const name of missing) {
    const ing = all.find((i) => i.name.trim() === name);
    const sub = usableSubstitute(name, ing?.quantity ?? "", have, synonyms);
    if (sub) out.push({ name, sub });
  }
  return out;
}
