import { describe, expect, it } from "vitest";
import { filterRecipes, ingredientHits, type Filters } from "./filter";
import type { Recipe } from "./types";

const recipe = (name: string, category: string, tags: string[]): Recipe => ({
  id: name,
  name,
  category,
  tags,
  ingredients: [],
  seasonings: [],
  extraGroups: [],
  steps: [],
  createdAt: 0,
});

const recipes = [
  recipe("親子丼", "主食", ["時短", "簡単"]),
  recipe("サラダチキン", "主菜", ["ダイエット", "時短"]),
  recipe("ｶﾚｰ", "主菜", ["節約"]),
];

const withIng = (name: string, ing: string[], extra: Partial<Recipe> = {}): Recipe => ({
  ...recipe(name, "主菜", []),
  ingredients: ing.map((n) => ({ name: n, quantity: "1" })),
  ...extra,
});
const sukiyaki = withIng("すき焼き", ["牛肉", "白滝", "長ねぎ"]);
const salad = withIng("コールスロー", ["キャベツ", "にんじん"], { seasonings: [{ name: "ごま油", quantity: "少々" }] });
const stirfry = withIng("野菜炒め", ["キャベツ", "しらたき"], { extraGroups: [{ name: "トッピング", items: [{ name: "かつお節", quantity: "適量" }] }] });
const withIngs = [sukiyaki, salad, stirfry];
const hit = (q: string) => filterRecipes(withIngs, { ...none, q }).map((r) => r.name);

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

describe("材料での検索", () => {
  it("材料の名前でも探せる", () => {
    expect(hit("白滝")).toEqual(["すき焼き"]);
    expect(hit("キャベツ")).toEqual(["コールスロー", "野菜炒め"]);
  });
  it("スペースで区切ると、すべてを使う料理だけが出る(材料どうし・料理名と材料)", () => {
    expect(hit("キャベツ しらたき")).toEqual(["野菜炒め"]);
    expect(hit("キャベツ　にんじん")).toEqual(["コールスロー"]);
    expect(hit("すき焼き 長ねぎ")).toEqual(["すき焼き"]);
    expect(hit("白滝 キャベツ")).toEqual([]);
  });
  it("調味料・追加グループの材料も探せる。ひらがな・カタカナの違いは気にしない", () => {
    expect(hit("ごま油")).toEqual(["コールスロー"]);
    expect(hit("かつお節")).toEqual(["野菜炒め"]);
    expect(hit("ニンジン")).toEqual(["コールスロー"]);
  });
  it("よみがなでも探せる", () => {
    const r = { ...recipe("親子丼", "主食", []), reading: "おやこどん" };
    expect(filterRecipes([r], { ...none, q: "おやこ" })).toHaveLength(1);
    expect(filterRecipes([r], { ...none, q: "オヤコ" })).toHaveLength(1);
  });
  it("カテゴリーと組み合わせられる", () => {
    const r = withIng("カレー", ["キャベツ"], { category: "主食" });
    expect(filterRecipes([r, salad], { ...none, q: "キャベツ", category: "主食" }).map((x) => x.name)).toEqual(["カレー"]);
  });
});

describe("ingredientHits(材料で見つかったものの印)", () => {
  it("材料に当たった名前だけを返す", () => {
    expect(ingredientHits(sukiyaki, "白滝")).toEqual(["白滝"]);
    expect(ingredientHits(stirfry, "キャベツ しらたき")).toEqual(["キャベツ", "しらたき"]);
  });
  it("料理名に当たっているときは、印を出さない。検索なしも出さない", () => {
    expect(ingredientHits(sukiyaki, "すき焼き")).toEqual([]);
    expect(ingredientHits(sukiyaki, "")).toEqual([]);
    expect(ingredientHits(sukiyaki, "ねぎ すき焼き")).toEqual(["長ねぎ"]);
  });
});
