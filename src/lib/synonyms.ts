import { toHiragana } from "./reading";

// 材料の「言い換え」。同じ材料の別の呼び方(白滝・しらたき・糸こんにゃく)を、同じものとして扱う。
// 検索と、冷蔵庫さがしで使う。ひらがな・カタカナの違いは、もともと区別しないので、漢字との組み合わせを中心に入れてある。

export type SynonymGroup = string[];

export const MAX_USER_GROUPS = 100;
export const MAX_WORDS_PER_GROUP = 10;
export const MAX_WORD_LENGTH = 30;

/** 標準で入っている言い換え(自分で足した分は、設定で足す) */
export const DEFAULT_SYNONYMS: SynonymGroup[] = [
  ["玉ねぎ", "たまねぎ", "玉葱", "オニオン"],
  ["長ねぎ", "白ねぎ", "長葱"],
  ["青ねぎ", "万能ねぎ", "小ねぎ", "あさつき"],
  ["にんじん", "人参", "キャロット"],
  ["じゃがいも", "じゃが芋", "馬鈴薯"],
  ["さつまいも", "さつま芋", "薩摩芋"],
  ["さといも", "里芋", "里いも"],
  ["大根", "だいこん"],
  ["白菜", "はくさい"],
  ["きゅうり", "胡瓜"],
  ["なす", "茄子"],
  ["かぼちゃ", "南瓜"],
  ["ごぼう", "牛蒡"],
  ["れんこん", "蓮根"],
  ["たけのこ", "筍", "竹の子"],
  ["かぶ", "蕪"],
  ["しょうが", "生姜"],
  ["にんにく", "大蒜"],
  ["みょうが", "茗荷"],
  ["しそ", "大葉", "青じそ", "紫蘇"],
  ["ほうれん草", "ほうれんそう"],
  ["小松菜", "こまつな"],
  ["チンゲン菜", "青梗菜", "ちんげんさい"],
  ["水菜", "みずな"],
  ["アスパラ", "アスパラガス"],
  ["さやいんげん", "いんげん"],
  ["さやえんどう", "絹さや"],
  ["グリーンピース", "グリンピース"],
  ["ミニトマト", "プチトマト"],
  ["とうもろこし", "コーン"],
  ["しいたけ", "椎茸"],
  ["えのき", "えのきだけ", "榎茸"],
  ["しめじ", "ぶなしめじ", "占地"],
  ["まいたけ", "舞茸"],
  ["たまご", "卵", "玉子", "鶏卵"],
  ["豆腐", "とうふ"],
  ["しらたき", "白滝", "糸こんにゃく", "糸蒟蒻"],
  ["こんにゃく", "蒟蒻"],
  ["油揚げ", "あぶらあげ"],
  ["厚揚げ", "あつあげ", "生揚げ"],
  ["ひき肉", "挽き肉", "挽肉", "ミンチ"],
  ["豚肉", "豚こま切れ肉", "豚こま"],
  ["鶏肉", "とり肉", "鳥肉", "鶏もも肉", "鶏むね肉", "鶏胸肉"],
  ["牛肉", "牛こま切れ肉", "牛薄切り肉"],
  ["ウインナー", "ウィンナー", "ソーセージ", "ウインナーソーセージ"],
  ["鮭", "さけ", "しゃけ"],
  ["さば", "鯖"],
  ["あじ", "鯵"],
  ["えび", "海老"],
  ["いか", "烏賊"],
  ["ちくわ", "竹輪"],
  ["かまぼこ", "蒲鉾"],
  ["ツナ", "ツナ缶"],
  ["わかめ", "若布"],
  ["ひじき", "羊栖菜"],
  ["のり", "海苔"],
  ["牛乳", "ミルク"],
  ["スパゲッティ", "スパゲティ", "パスタ"],
  ["ごはん", "ご飯"],
  ["もち", "餅"],
  ["小麦粉", "薄力粉"],
  ["片栗粉", "かたくり粉"],
  ["しょうゆ", "醤油"],
  ["みそ", "味噌"],
  ["みりん", "味醂"],
  ["ごま油", "胡麻油"],
  ["ごま", "胡麻"],
  ["こしょう", "胡椒"],
  ["かつお節", "鰹節", "かつおぶし"],
  ["昆布", "こんぶ"],
  ["だしの素", "顆粒だし"],
];

const norm = (s: string) => toHiragana(s).toLowerCase();

/** 言い換えの1組を整える。同じ材料の別の呼び方が、2つ以上あるときだけ有効(重複・空は捨てる) */
export function cleanGroup(words: unknown): SynonymGroup | null {
  if (!Array.isArray(words)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (typeof w !== "string") continue;
    const t = w.normalize("NFKC").replace(/[\s　]+/g, " ").replace(/[<>]/g, "").trim().slice(0, MAX_WORD_LENGTH);
    const k = norm(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_WORDS_PER_GROUP) break;
  }
  return out.length >= 2 ? out : null;
}

/** 入力欄の文字(「、」「,」「=」「/」区切り)を、1組にする */
export const splitGroup = (text: string): SynonymGroup | null => cleanGroup(text.split(/[、,，=＝\/／\n]+/));

export type SynonymIndex = {
  groups: SynonymGroup[];
  /** 名前が、どの組に当たるか(組の番号) */
  groupsOf: (name: string) => Set<number>;
  /** 2つの名前が、同じ材料の言い換えか */
  same: (a: string, b: string) => boolean;
};

/** 組の言葉が、名前に当たるか(同じ、または、名前に言葉がふくまれる。1文字の言葉は、同じときだけ) */
function memberMatches(member: string, name: string): boolean {
  if (member === name) return true;
  if (member.length >= 2 && name.includes(member)) return true;
  return name.length >= 2 && member.length >= 2 && member.includes(name);
}

export function buildSynonymIndex(groups: SynonymGroup[]): SynonymIndex {
  const normalized = groups.map((g) => g.map(norm));
  const cache = new Map<string, Set<number>>();
  const groupsOf = (name: string) => {
    const n = norm(name);
    let hit = cache.get(n);
    if (!hit) {
      hit = new Set<number>();
      if (n) normalized.forEach((g, i) => g.some((m) => memberMatches(m, n)) && hit!.add(i));
      cache.set(n, hit);
    }
    return hit;
  };
  const same = (a: string, b: string) => {
    const ga = groupsOf(a);
    if (ga.size === 0) return false;
    for (const i of groupsOf(b)) if (ga.has(i)) return true;
    return false;
  };
  return { groups, groupsOf, same };
}

/** 標準の言い換えだけの索引(自分で足した分は、含まない) */
export const DEFAULT_INDEX: SynonymIndex = buildSynonymIndex(DEFAULT_SYNONYMS);
