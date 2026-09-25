import { describe, expect, it } from "vitest";
import { filterRecipes, type Filters } from "./filter";
import type { Recipe } from "./types";

const recipe = (name: string, category: string, tags: string[]): Recipe => ({
  id: name,
  name,
  category,
  tags,
  ingredients: [],
  steps: [],
  createdAt: 0,
});

const recipes = [
  recipe("親子丼", "主食", ["時短", "簡単"]),
  recipe("サラダチキン", "主菜", ["ダイエット", "時短"]),
  recipe("ｶﾚｰ", "主菜", ["節約"]),
];

const none: Filters = { q: "", category: "", tags: [] };
const names = (f: Partial<Filters>) =>
  filterRecipes(recipes, { ...none, ...f }).map((r) => r.name);

describe("filterRecipes", () => {
  it("条件がなければすべて返す", () => {
    expect(names({})).toEqual(["親子丼", "サラダチキン", "ｶﾚｰ"]);
  });

  it("料理名の部分一致で検索できる", () => {
    expect(names({ q: "親子" })).toEqual(["親子丼"]);
  });

  it("タグでも検索できる", () => {
    expect(names({ q: "ダイエット" })).toEqual(["サラダチキン"]);
  });

  it("全角/半角・大文字小文字の揺れを吸収する", () => {
    expect(names({ q: "カレー" })).toEqual(["ｶﾚｰ"]);
  });

  it("複数の検索語はすべて満たす必要がある(全角スペース区切り含む)", () => {
    expect(names({ q: "親子　時短" })).toEqual(["親子丼"]);
    expect(names({ q: "親子 ダイエット" })).toEqual([]);
  });

  it("前後の空白だけの検索語は無視する", () => {
    expect(names({ q: "   " })).toHaveLength(3);
  });

  it("カテゴリーで絞り込める", () => {
    expect(names({ category: "主菜" })).toEqual(["サラダチキン", "ｶﾚｰ"]);
  });

  it("複数タグはAND(すべて含む)で絞り込む", () => {
    expect(names({ tags: ["時短"] })).toEqual(["親子丼", "サラダチキン"]);
    expect(names({ tags: ["時短", "簡単"] })).toEqual(["親子丼"]);
    expect(names({ tags: ["簡単", "ダイエット"] })).toEqual([]);
  });

  it("カテゴリー・タグ・検索語を組み合わせられる", () => {
    expect(names({ category: "主菜", tags: ["時短"], q: "チキン" })).toEqual([
      "サラダチキン",
    ]);
    expect(names({ category: "主食", tags: ["ダイエット"] })).toEqual([]);
  });
});
