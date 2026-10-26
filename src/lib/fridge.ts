import { toHiragana, compareRecipes } from "./reading";
import { ingredientNames } from "./filter";
import type { Recipe } from "./types";

// 「冷蔵庫にある材料」から、作れる料理をさがす。

export type FridgeMatch = {
  recipe: Recipe;
  /** 手持ちで使える材料(レシピ側の名前) */
  used: string[];
  /** 足りない材料(レシピ側の名前) */
  missing: string[];
};

const norm = (s: string) => toHiragana(s).toLowerCase();

/** 手持ちの材料の言葉を整える(全角・半角、空白。重複・空は捨てる) */
export function cleanHave(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.normalize("NFKC").replace(/[\s　]+/g, " ").trim().slice(0, 30);
    const k = norm(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** 入力欄の文字を、区切り(スペース・読点・カンマ)で、手持ちの材料に分ける */
export const splitHave = (text: string): string[] => cleanHave(text.split(/[\s　,、，・]+/));

/**
 * レシピの材料名が、手持ちの材料でまかなえるか。
 * 「ねぎ」と「長ねぎ」、「豚」と「豚肉」のように、片方がもう片方をふくむなら、同じものとみなす
 * (ただし、レシピ側が1文字の材料(卵・米など)は、手持ちの言葉に、それがふくまれるだけでは、同じとみなさない)。
 */
export function covers(have: string[], ingredient: string): boolean {
  const b = norm(ingredient);
  if (!b) return false;
  return have.some((h) => {
    const a = norm(h);
    return a.length > 0 && (b.includes(a) || (b.length >= 2 && a.includes(b)));
  });
}

export type FridgeOptions = {
  /** 調味料も、あるかを数える(初期値 false: 調味料は、家にあるものとする) */
  includeSeasonings?: boolean;
  /** 足りない材料が、これより多い料理は出さない(初期値 2) */
  maxMissing?: number;
};

/** 手持ちの材料で、作れる(または、あと少しで作れる)料理を、作りやすい順に返す。手持ちを1つも使わない料理は出さない */
export function findByFridge(recipes: Recipe[], haveInput: string[], opts: FridgeOptions = {}): FridgeMatch[] {
  const have = cleanHave(haveInput);
  if (have.length === 0) return [];
  const maxMissing = opts.maxMissing ?? 2;
  const out: FridgeMatch[] = [];
  for (const recipe of recipes) {
    const names = opts.includeSeasonings
      ? ingredientNames(recipe)
      : [...new Set([...recipe.ingredients, ...recipe.extraGroups.flatMap((g) => g.items)].map((i) => i.name.trim()).filter(Boolean))];
    if (names.length === 0) continue;
    const used = names.filter((n) => covers(have, n));
    const missing = names.filter((n) => !covers(have, n));
    if (used.length === 0 || missing.length > maxMissing) continue;
    out.push({ recipe, used, missing });
  }
  return out.sort(
    (a, b) => a.missing.length - b.missing.length || b.used.length - a.used.length || compareRecipes(a.recipe, b.recipe),
  );
}

/** 作れる(あと少しで作れる)料理がないとき用: 足りない数が多くても、手持ちを使う料理を、近い順に数件返す */
export function nearestByFridge(recipes: Recipe[], haveInput: string[], limit = 5, opts: Pick<FridgeOptions, "includeSeasonings"> = {}): FridgeMatch[] {
  return findByFridge(recipes, haveInput, { ...opts, maxMissing: Infinity }).slice(0, limit);
}

/** 手持ちの候補にする、よく使われる材料(多い順。すでに入れたものは除く) */
export function popularIngredients(recipes: Recipe[], have: string[], limit = 12): string[] {
  const count = new Map<string, number>();
  for (const r of recipes) for (const n of [...r.ingredients, ...r.extraGroups.flatMap((g) => g.items)].map((i) => i.name.trim()).filter(Boolean)) {
    count.set(n, (count.get(n) ?? 0) + 1);
  }
  return [...count.entries()]
    .filter(([n]) => !covers(have, n))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, limit)
    .map(([n]) => n);
}
