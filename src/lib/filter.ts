import { toHiragana } from "./reading";
import type { Recipe } from "./types";

export type Filters = {
  q: string;
  category: string;
  tags: string[];
};

// 全角/半角・大文字小文字・カタカナ/ひらがなの揺れを吸収する(「カレー」と「かれー」は同じ)
const normalize = (s: string) => toHiragana(s).toLowerCase();

/** 検索語(スペース区切り)。すべての語を満たすレシピだけが出る */
const termsOf = (q: string) => q.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean).map(normalize);

/** 材料・調味料・追加グループの材料の名前(重複なし) */
export function ingredientNames(r: Recipe): string[] {
  const all = [...r.ingredients, ...r.seasonings, ...r.extraGroups.flatMap((g) => g.items)];
  return [...new Set(all.map((i) => i.name.trim()).filter(Boolean))];
}

export function filterRecipes(recipes: Recipe[], filters: Filters): Recipe[] {
  const terms = termsOf(filters.q);

  return recipes.filter((r) => {
    if (filters.category && r.category !== filters.category) return false;
    if (!filters.tags.every((t) => r.tags.includes(t))) return false;

    // 検索語はすべて、料理名・よみがな・タグ・材料のどれかに部分一致する必要がある
    const haystacks = [r.name, r.reading ?? "", ...r.tags, ...ingredientNames(r)].map(normalize);
    return terms.every((term) => haystacks.some((h) => h.includes(term)));
  });
}

/**
 * 検索で、材料の名前が当たったもの(料理名・タグでは当たらず、材料で見つかったことを、画面に出すため)。
 * 料理名やタグに当たっている語は、数えない。
 */
export function ingredientHits(r: Recipe, q: string): string[] {
  const terms = termsOf(q);
  if (terms.length === 0) return [];
  const others = [r.name, r.reading ?? "", ...r.tags].map(normalize);
  const hits: string[] = [];
  for (const name of ingredientNames(r)) {
    const n = normalize(name);
    if (terms.some((t) => n.includes(t) && !others.some((o) => o.includes(t)))) hits.push(name);
  }
  return hits;
}
