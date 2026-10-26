import { covers } from "./fridge";
import { compareRecipes } from "./reading";
import { DEFAULT_INDEX, type SynonymIndex } from "./synonyms";
import type { Recipe } from "./types";

// 旬の食材(日本の、ふつうの時期)から、レシピを選んで、献立を提案する。
// 時期は、地方や年でずれます。「だいたいの目安」です。

export const SEASONAL: Record<number, string[]> = {
  1: ["大根", "白菜", "ほうれん草", "長ねぎ", "ごぼう", "れんこん", "小松菜", "ブロッコリー", "かぶ", "ぶり", "みかん"],
  2: ["白菜", "ブロッコリー", "カリフラワー", "ほうれん草", "小松菜", "長ねぎ", "大根", "かぶ", "ぶり", "菜の花"],
  3: ["キャベツ", "菜の花", "アスパラ", "たけのこ", "セロリ", "わかめ", "あさり", "春菊", "新玉ねぎ"],
  4: ["キャベツ", "新玉ねぎ", "たけのこ", "アスパラ", "グリーンピース", "そら豆", "菜の花", "新じゃが", "あさり"],
  5: ["アスパラ", "そら豆", "グリーンピース", "新じゃが", "新玉ねぎ", "キャベツ", "さやえんどう", "レタス"],
  6: ["きゅうり", "トマト", "ピーマン", "さやいんげん", "玉ねぎ", "枝豆", "あじ", "ズッキーニ", "梅"],
  7: ["きゅうり", "トマト", "なす", "ピーマン", "オクラ", "とうもろこし", "ゴーヤ", "みょうが", "しそ", "枝豆", "ズッキーニ", "冬瓜"],
  8: ["なす", "トマト", "ピーマン", "オクラ", "とうもろこし", "ゴーヤ", "かぼちゃ", "枝豆", "ズッキーニ", "冬瓜", "みょうが"],
  9: ["さつまいも", "かぼちゃ", "なす", "しめじ", "まいたけ", "しいたけ", "さんま", "さといも", "栗"],
  10: ["さつまいも", "さといも", "しめじ", "まいたけ", "しいたけ", "えのき", "かぼちゃ", "栗", "さんま", "鮭", "れんこん", "ごぼう"],
  11: ["白菜", "大根", "れんこん", "ごぼう", "ほうれん草", "かぶ", "さといも", "長ねぎ", "ぶり", "鮭", "春菊"],
  12: ["大根", "白菜", "長ねぎ", "ほうれん草", "小松菜", "かぶ", "ゆず", "ぶり", "ごぼう", "れんこん", "ブロッコリー", "春菊"],
};

/** 月(1〜12)の旬の食材。範囲外・おかしな値は空 */
export const seasonalIngredients = (month: number): string[] => SEASONAL[Math.trunc(month)] ?? [];

/** 日付(YYYY-MM-DD)の月 */
export const monthOfKey = (key: string): number => Number(key.slice(5, 7));

/** そのレシピの材料(調味料は除く)のうち、旬のもの(レシピ側の名前) */
export function seasonalHits(recipe: Recipe, month: number, synonyms: SynonymIndex = DEFAULT_INDEX): string[] {
  const season = seasonalIngredients(month);
  if (season.length === 0) return [];
  const names = [...new Set([...recipe.ingredients, ...recipe.extraGroups.flatMap((g) => g.items)].map((i) => i.name.trim()).filter(Boolean))];
  return names.filter((n) => covers(season, n, synonyms));
}

export type SeasonalRecipe = { recipe: Recipe; hits: string[] };

/** 旬の材料を、たくさん使う順に並べる(使わない料理は、出さない) */
export function rankSeasonal(recipes: Recipe[], month: number, synonyms: SynonymIndex = DEFAULT_INDEX): SeasonalRecipe[] {
  return recipes
    .map((recipe) => ({ recipe, hits: seasonalHits(recipe, month, synonyms) }))
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || compareRecipes(a.recipe, b.recipe));
}

export const MENU_SLOTS = ["主菜", "副菜", "汁物"] as const;

export type MenuItem = SeasonalRecipe & { slot: (typeof MENU_SLOTS)[number] };
export type MenuDay = { date: string; items: MenuItem[] };

/** 決まった入力から、いつも同じ数を作る、かんたんな乱数(「別の案」のため) */
function jitter(id: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * 旬の食材を使う料理で、日ごとの献立(主菜・副菜・汁物)を提案する。
 * - 同じ料理は、一度しか使わない
 * - 旬の材料を多く使う料理が先。同じくらいなら、seed で順番を変える(「別の案」)
 * - 主菜・副菜・汁物のうち、旬の料理が足りないものは、空のまま(むりに入れない)
 */
export function proposeMenu(recipes: Recipe[], dates: string[], seed = 0, synonyms: SynonymIndex = DEFAULT_INDEX): MenuDay[] {
  const used = new Set<string>();
  const ranked = new Map<number, SeasonalRecipe[]>();
  const out: MenuDay[] = [];
  for (const date of dates) {
    const month = monthOfKey(date);
    if (!ranked.has(month)) ranked.set(month, rankSeasonal(recipes, month, synonyms));
    const pool = ranked.get(month)!;
    const items: MenuItem[] = [];
    for (const slot of MENU_SLOTS) {
      const pick = pool
        .filter((x) => x.recipe.category === slot && !used.has(x.recipe.id))
        // 旬の材料の数を、まず比べる。同じ数の中で、seed によって順番を変える
        .sort((a, b) => b.hits.length - a.hits.length || jitter(a.recipe.id, seed) - jitter(b.recipe.id, seed))[0];
      if (pick) {
        used.add(pick.recipe.id);
        items.push({ ...pick, slot });
      }
    }
    out.push({ date, items });
  }
  return out;
}
