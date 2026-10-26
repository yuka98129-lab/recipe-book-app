import { describe, expect, it } from "vitest";
import { cleanHave, covers, findByFridge, nearestByFridge, popularIngredients, splitHave } from "./fridge";
import type { Recipe } from "./types";

const r = (name: string, ing: string[], seasonings: string[] = [], extra: string[] = []): Recipe => ({
  id: name, name, category: "主菜", tags: [],
  ingredients: ing.map((n) => ({ name: n, quantity: "1" })),
  seasonings: seasonings.map((n) => ({ name: n, quantity: "少々" })),
  extraGroups: extra.length ? [{ name: "トッピング", items: extra.map((n) => ({ name: n, quantity: "適量" })) }] : [],
  steps: [], createdAt: 0,
});

const recipes = [
  r("野菜炒め", ["キャベツ", "豚肉", "にんじん"], ["塩", "ごま油"]),
  r("コールスロー", ["キャベツ", "にんじん"], ["マヨネーズ"]),
  r("すき焼き", ["牛肉", "白滝", "長ねぎ", "豆腐"]),
  r("親子丼", ["卵", "鶏肉", "玉ねぎ"], [], ["三つ葉"]),
  r("味噌汁", [], ["味噌"]),
];

describe("cleanHave / splitHave", () => {
  it("空白・重複・空を整える(ひらがな・カタカナ・全角半角の違いは同じ)", () => {
    expect(cleanHave([" キャベツ ", "きゃべつ", "", "ニンジン"])).toEqual(["キャベツ", "ニンジン"]);
    expect(splitHave("キャベツ、にんじん  豚肉,卵")).toEqual(["キャベツ", "にんじん", "豚肉", "卵"]);
  });
});

describe("covers", () => {
  it("片方がもう片方をふくめば、同じ材料とみなす", () => {
    expect(covers(["ねぎ"], "長ねぎ")).toBe(true);
    expect(covers(["長ねぎ"], "ねぎ")).toBe(true);
    expect(covers(["豚"], "豚肉")).toBe(true);
    expect(covers(["ニンジン"], "にんじん")).toBe(true);
    expect(covers(["牛肉"], "豚肉")).toBe(false);
  });
  it("レシピ側が1文字の材料は、手持ちの言葉に、ふくまれるだけでは、同じとみなさない", () => {
    expect(covers(["卵"], "卵")).toBe(true);
    expect(covers(["ゆで卵"], "卵")).toBe(false);
    expect(covers([], "卵")).toBe(false);
  });
});

describe("findByFridge", () => {
  const names = (have: string[], o = {}) => findByFridge(recipes, have, o).map((m) => `${m.recipe.name}:${m.missing.length}`);
  it("手持ちが空なら、何も出さない", () => {
    expect(names([])).toEqual([]);
  });
  it("足りない材料が少ない順。調味料は、あるものとする", () => {
    expect(names(["キャベツ", "にんじん"])).toEqual(["コールスロー:0", "野菜炒め:1"]);
  });
  it("足りない材料の名前と、使える材料を返す", () => {
    const m = findByFridge(recipes, ["キャベツ", "にんじん"]).find((x) => x.recipe.name === "野菜炒め")!;
    expect(m.used).toEqual(["キャベツ", "にんじん"]);
    expect(m.missing).toEqual(["豚肉"]);
  });
  it("調味料も数えるようにできる", () => {
    expect(names(["キャベツ", "にんじん"], { includeSeasonings: true })).toEqual(["コールスロー:1"]);
  });
  it("足りないのが3つ以上の料理・手持ちを1つも使わない料理は出さない", () => {
    expect(names(["豆腐"])).toEqual([]);
    expect(names(["白滝", "豆腐"])).toEqual(["すき焼き:2"]);
    expect(names(["みかん"])).toEqual([]);
  });
  it("追加グループの材料も数える。材料が1つもない料理は出さない", () => {
    expect(names(["卵", "鶏肉", "玉ねぎ"])).toEqual(["親子丼:1"]);
    expect(names(["味噌"])).toEqual([]);
  });
  it("最大の足りなさを変えられる", () => {
    expect(names(["豆腐"], { maxMissing: 3 })).toEqual(["すき焼き:3"]);
    expect(names(["キャベツ"], { maxMissing: 0 })).toEqual([]);
  });
});

describe("popularIngredients", () => {
  it("よく使われる材料(多い順)。手持ちでまかなえるものは除く", () => {
    expect(popularIngredients(recipes, [], 2)).toEqual(["キャベツ", "にんじん"]);
    expect(popularIngredients(recipes, ["キャベツ"], 1)).toEqual(["にんじん"]);
  });
});

describe("nearestByFridge", () => {
  it("足りない数が多くても、近い順に、数件を返す(手持ちを使うものだけ)", () => {
    const m = nearestByFridge(recipes, ["豆腐"], 3);
    expect(m.map((x) => x.recipe.name)).toEqual(["すき焼き"]);
    expect(m[0].missing).toEqual(["牛肉", "白滝", "長ねぎ"]);
    expect(nearestByFridge(recipes, [], 3)).toEqual([]);
  });
});

describe("言い換え(冷蔵庫さがし)", () => {
  it("漢字・かなの違いや、言い換えの材料でも、そろっているとみなす", () => {
    expect(covers(["白滝"], "しらたき")).toBe(true);
    expect(covers(["鶏肉"], "鶏もも肉")).toBe(true);
    expect(covers(["ひき肉"], "合いびき肉")).toBe(false);
    const rs = [r("肉豆腐", ["牛肉", "しらたき", "豆腐"])];
    const m = findByFridge(rs, ["牛肉", "白滝", "とうふ"]);
    expect(m).toHaveLength(1);
    expect(m[0].missing).toEqual([]);
  });
});
