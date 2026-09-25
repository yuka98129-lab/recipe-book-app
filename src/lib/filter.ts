import type { Recipe } from "./types";

export type Filters = {
  q: string;
  category: string;
  tags: string[];
};

// 全角/半角・大文字小文字の揺れを吸収する
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim();

export function filterRecipes(recipes: Recipe[], filters: Filters): Recipe[] {
  const terms = normalize(filters.q).split(/\s+/).filter(Boolean);

  return recipes.filter((r) => {
    if (filters.category && r.category !== filters.category) return false;
    if (!filters.tags.every((t) => r.tags.includes(t))) return false;

    // 検索語はすべて、料理名またはタグのどちらかに部分一致する必要がある
    const haystacks = [r.name, ...r.tags].map(normalize);
    return terms.every((term) => haystacks.some((h) => h.includes(term)));
  });
}
