import { daysBetween, formatDay, type PlanEntry } from "./plan";
import type { Ingredient, Recipe } from "./types";

// 買い物リスト。期間内の献立の材料を、同じ名前・同じ単位のものだけ足して、売り場ごとに並べる。
// AI は使わない(決まったルールで計算するので、毎回同じ結果になる)。

export const GROUPS = ["野菜・果物", "肉・魚", "卵・乳製品", "豆腐・乾物など", "米・麺・パン", "調味料・油", "その他"] as const;
export type Group = (typeof GROUPS)[number];

// ---- 分量の読み取り ----

export type Quantity =
  | { kind: "amount"; value: number; unit: string }
  | { kind: "text"; text: string } // 「少々」「適量」「2〜3個」など、足せないもの
  | { kind: "none" };

const UNIT_ALIASES: Record<string, string> = {
  グラム: "g", キログラム: "kg", キロ: "kg", ミリリットル: "ml", cc: "ml", リットル: "l",
  こ: "個", コ: "個", ヶ: "個", ケ: "個", ほん: "本", まい: "枚", ぱっく: "パック", かん: "缶", ふくろ: "袋", かけ: "片",
};
const UNIT_TO_BASE: Record<string, { unit: string; factor: number }> = {
  kg: { unit: "g", factor: 1000 },
  l: { unit: "ml", factor: 1000 },
};
const WORD_ONLY = /^(少々|適量|適宜|少し|ひとつまみ|一つまみ|お好みで|好みで|好きなだけ|たっぷり|ちょっと|少量)$/;

function parseNumber(s: string): { value: number; rest: string } | null {
  // 帯分数(1と1/2、1 1/2)→ 分数(1/2)→ 小数・整数 の順に試す
  let m = /^(\d+)\s*(?:と|\s)\s*(\d+)\/(\d+)/.exec(s);
  if (m && Number(m[3]) > 0) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: s.slice(m[0].length) };
  m = /^(\d+)\/(\d+)/.exec(s);
  if (m && Number(m[2]) > 0) return { value: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length) };
  m = /^(\d+(?:\.\d+)?)/.exec(s);
  if (m) return { value: Number(m[1]), rest: s.slice(m[0].length) };
  return null;
}

/** 「3個」「大さじ1/2」「200g」「1と1/2カップ」「少々」などを読み取る */
export function parseQuantity(raw: string): Quantity {
  let s = raw.normalize("NFKC").trim();
  if (s === "") return { kind: "none" };
  if (WORD_ONLY.test(s)) return { kind: "text", text: s };
  s = s.replace(/^(約|およそ|大体|だいたい)\s*/, "");

  // 「大さじ」「小さじ」は、数字が後ろに来る
  const spoon = /^(大さじ|小さじ)\s*(.*)$/.exec(s);
  if (spoon) {
    const n = parseNumber(spoon[2]);
    if (!n || /^\s*[〜~\-–]/.test(n.rest)) return { kind: "text", text: raw.trim() };
    return finish(n.value, spoon[1], n.rest, raw);
  }

  const n = parseNumber(s);
  if (!n) return { kind: "text", text: raw.trim() };
  // 範囲(2〜3個)は足せない
  if (/^\s*[〜~\-–ー]\s*\d/.test(n.rest)) return { kind: "text", text: raw.trim() };
  return finish(n.value, "", n.rest, raw);
}

/** 単位を整えて返す(「(約200g)」「ほど」などの付け足しは単位に含めない) */
function finish(value: number, prefix: string, rest: string, raw: string): Quantity {
  // 「大さじ2」のあとの言葉(「大さじ2強」など)は、単位に含めない
  if (prefix) return { kind: "amount", value, unit: prefix };

  const trimmed = rest.trim();
  let unit = trimmed.replace(/[((].*$/, "").replace(/(ほど|程度|くらい|ぐらい|位)$/, "").trim();
  // 単位の位置に、単位でなさそうな文章が来たら、足さずにそのまま見せる
  if (unit === "" && trimmed !== "" && !/^[((]/.test(trimmed)) return { kind: "text", text: raw.trim() };
  // 英字の単位は、大文字小文字を区別しない(L・Kg・ML など)
  if (/^[A-Za-z]+$/.test(unit)) unit = unit.toLowerCase();
  unit = UNIT_ALIASES[unit] ?? unit;
  const base = UNIT_TO_BASE[unit];
  if (base) return { kind: "amount", value: value * base.factor, unit: base.unit };
  // 単位は、文字だけ(数字や記号が混ざっていたら、読み間違いを避けて、そのまま見せる)
  if (unit.length > 8 || !/^[\p{L}]*$/u.test(unit)) return { kind: "text", text: raw.trim() };
  return { kind: "amount", value, unit };
}

/** 材料名の比較用(全角半角・カタカナ/ひらがな・空白・「(…)」の違いを無視する) */
export function nameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[((][^))]*[))]/g, "")
    .replace(/\s+/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();
}

// ---- 売り場の分類 ----

const KEYWORDS: Record<Group, string[]> = {
  "野菜・果物": [
    "野菜", "玉ねぎ", "たまねぎ", "ねぎ", "にんじん", "人参", "じゃがいも", "いも", "さつまいも", "大根", "かぶ", "キャベツ", "白菜", "レタス",
    "トマト", "ミニトマト", "きゅうり", "なす", "ナス", "ピーマン", "パプリカ", "ほうれん草", "小松菜", "チンゲン菜", "ブロッコリー", "カリフラワー",
    "もやし", "ごぼう", "れんこん", "かぼちゃ", "アスパラ", "ゴーヤ", "オクラ", "セロリ", "ニラ", "にら", "しょうが", "生姜", "にんにく", "ニンニク",
    "しめじ", "えのき", "しいたけ", "椎茸", "まいたけ", "エリンギ", "きのこ", "レモン", "りんご", "バナナ", "みかん", "オレンジ", "大葉", "しそ",
    "みょうが", "パセリ", "水菜", "春菊", "とうもろこし", "コーン", "枝豆", "いんげん", "さやえんどう", "グリーンピース", "アボカド", "ズッキーニ",
  ],
  "肉・魚": [
    "肉", "鶏", "豚", "牛", "ひき肉", "ベーコン", "ハム", "ウインナー", "ソーセージ", "ささみ", "手羽", "魚", "鮭", "さけ", "サーモン", "さば", "サバ",
    "あじ", "アジ", "いわし", "ぶり", "たら", "まぐろ", "ツナ", "えび", "エビ", "いか", "イカ", "たこ", "タコ", "あさり", "ほたて", "ホタテ", "かに",
    "カニ", "ちくわ", "かまぼこ", "はんぺん", "しらす", "ししゃも", "さんま",
  ],
  "卵・乳製品": ["卵", "たまご", "玉子", "牛乳", "ミルク", "チーズ", "ヨーグルト", "バター", "生クリーム", "クリーム"],
  "豆腐・乾物など": [
    "豆腐", "とうふ", "油揚げ", "厚揚げ", "納豆", "高野豆腐", "大豆", "豆乳", "おから", "がんも", "ひよこ豆", "豆", "こんにゃく", "しらたき",
    "わかめ", "ひじき", "海苔", "のり", "昆布", "もずく", "乾燥", "切り干し", "春雨", "ごま",
  ],
  "米・麺・パン": [
    "米", "ご飯", "ごはん", "もち米", "パスタ", "スパゲッティ", "うどん", "そば", "そうめん", "ラーメン", "中華麺", "麺", "パン", "食パン", "小麦粉",
    "薄力粉", "強力粉", "片栗粉", "パン粉", "餅", "もち", "オートミール", "シリアル", "皮",
  ],
  "調味料・油": [
    "しょうゆ", "醤油", "塩", "こしょう", "胡椒", "砂糖", "みりん", "酒", "料理酒", "酢", "味噌", "みそ", "油", "サラダ油", "ごま油", "ゴマ油",
    "オリーブオイル", "オリーブ油", "マヨネーズ", "ケチャップ", "ソース", "ウスターソース", "めんつゆ", "だし", "顆粒だし", "和風だし", "白だし",
    "コンソメ", "鶏がらスープの素", "中華だし", "スープの素", "カレールー", "カレー粉", "ルー", "豆板醤", "コチュジャン", "ラー油", "からし", "わさび",
    "マスタード", "はちみつ", "ジャム", "ポン酢", "ドレッシング", "焼肉のたれ", "たれ", "つゆ", "スパイス", "ナツメグ", "シナモン", "唐辛子", "七味",
    "粉チーズ", "オイスターソース", "ナンプラー", "トマトソース", "水", "湯", "重曹", "ベーキングパウダー", "ゼラチン", "バニラ",
  ],
  その他: [],
};

/** 材料名から売り場を推定する。複数当てはまるときは、いちばん長く一致した言葉を採用する(「油揚げ」を「油」にしない) */
export function classify(name: string): Group {
  const n = name.normalize("NFKC");
  let best: { group: Group; len: number } | null = null;
  for (const g of GROUPS) {
    for (const k of KEYWORDS[g]) {
      if (n.includes(k) && (!best || k.length > best.len)) best = { group: g, len: k.length };
    }
  }
  return best?.group ?? "その他";
}

// ---- 買い物リストの計算 ----

export type ItemSource = { recipeName: string; date: string; quantity: string };

export type ShoppingItem = {
  /** チェック状態の記録に使う(同じ材料名なら同じ値) */
  key: string;
  name: string;
  group: Group;
  /** 足した結果。単位ごとに1つ(例: ["3個", "300g"]) */
  amounts: string[];
  /** 足せなかった分量(「少々」「2〜3個」など) */
  notes: string[];
  sources: ItemSource[];
};

export type ShoppingList = {
  groups: { group: Group; items: ShoppingItem[] }[];
  /** 期間内の献立の数 */
  dishCount: number;
  /** 期間内の日数 */
  dayCount: number;
  /** 削除されて、材料を出せなかった献立 */
  missing: { date: string }[];
};

/** 表示用の数字: 整数はそのまま、小数は小数第2位まで(末尾の 0 は消す) */
export function formatNumber(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r);
}

const formatAmount = (value: number, unit: string) =>
  unit === "大さじ" || unit === "小さじ" ? `${unit}${formatNumber(value)}` : `${formatNumber(value)}${unit}`;

type Acc = {
  key: string; name: string; fromSeasoning: boolean;
  amounts: Map<string, number>; notes: string[]; sources: ItemSource[];
};

/**
 * 期間(from〜to、両端を含む)の献立から、買い物リストを作る。
 * - 作る人数がレシピの人数と違うときは、分量を人数の比で増減する(「少々」などはそのまま)
 */
export function buildShoppingList(entries: PlanEntry[], recipes: Recipe[], from: string, to: string): ShoppingList {
  const days = daysBetween(from, to);
  const inRange = entries.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const acc = new Map<string, Acc>();
  const missing: { date: string }[] = [];
  let dishCount = 0;

  for (const e of inRange) {
    const recipe = byId.get(e.recipeId);
    if (!recipe) {
      missing.push({ date: e.date });
      continue;
    }
    dishCount++;
    const factor = e.servings !== null && recipe.servings ? e.servings / recipe.servings : 1;
    const sections: { rows: Ingredient[]; seasoning: boolean }[] = [
      { rows: recipe.ingredients, seasoning: false },
      { rows: recipe.seasonings, seasoning: true },
      ...recipe.extraGroups.map((g) => ({ rows: g.items, seasoning: false })),
    ];
    for (const { rows, seasoning } of sections) {
      for (const row of rows) {
        const name = row.name.trim();
        const key = nameKey(name);
        if (!key) continue;
        const a: Acc = acc.get(key) ?? { key, name, fromSeasoning: false, amounts: new Map(), notes: [], sources: [] };
        a.fromSeasoning ||= seasoning;
        const q = parseQuantity(row.quantity);
        let shown = row.quantity.trim();
        if (q.kind === "amount") {
          const value = q.value * factor;
          a.amounts.set(q.unit, (a.amounts.get(q.unit) ?? 0) + value);
          shown = formatAmount(value, q.unit);
        } else if (q.kind === "text" && !a.notes.includes(q.text)) {
          a.notes.push(q.text);
        }
        a.sources.push({ recipeName: recipe.name, date: e.date, quantity: shown });
        acc.set(key, a);
      }
    }
  }

  const items: ShoppingItem[] = [...acc.values()].map((a) => ({
    key: a.key,
    name: a.name,
    group: a.fromSeasoning ? "調味料・油" : classify(a.name),
    amounts: [...a.amounts].map(([unit, v]) => formatAmount(v, unit)),
    notes: a.notes,
    sources: a.sources,
  }));

  const groups = GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group).sort((x, y) => x.name.localeCompare(y.name, "ja")),
  })).filter((g) => g.items.length > 0);

  return { groups, dishCount, dayCount: days.length, missing };
}

/** 1つの材料の表示(「3個 + 300g」「少々」) */
export function describeItem(item: ShoppingItem): string {
  const amounts = item.amounts.join(" + ");
  return [...(amounts ? [amounts] : []), ...item.notes].join("、");
}

/** コピー用のテキスト */
export function shoppingToText(list: ShoppingList, from: string, to: string, checked: Set<string> = new Set()): string {
  const lines = [`買い物リスト(${formatDay(from)} 〜 ${formatDay(to)})`];
  for (const g of list.groups) {
    lines.push("", `■${g.group}`);
    for (const i of g.items) {
      const d = describeItem(i);
      lines.push(`${checked.has(i.key) ? "✓" : "・"}${i.name}${d ? ` ${d}` : ""}`);
    }
  }
  return lines.join("\n");
}
