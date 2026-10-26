import { describe, expect, it } from "vitest";
import { monthOfKey, proposeMenu, rankSeasonal, seasonalHits, seasonalIngredients, SEASONAL } from "./seasonal";
import type { Recipe } from "./types";

const mk = (id: string, name: string, category: string, ings: string[], seasonings: string[] = []): Recipe =>
  ({
    id,
    name,
    category,
    tags: [],
    ingredients: ings.map((n) => ({ name: n, quantity: "適量" })),
    seasonings: seasonings.map((n) => ({ name: n, quantity: "適量" })),
    extraGroups: [],
    steps: [],
  }) as unknown as Recipe;

describe("旬の食材の表", () => {
  it("12か月ぶんあり、どの月にも食材が入っている", () => {
    for (let m = 1; m <= 12; m++) expect(SEASONAL[m].length).toBeGreaterThanOrEqual(6);
  });
  it("範囲外・おかしな月は、空", () => {
    expect(seasonalIngredients(0)).toEqual([]);
    expect(seasonalIngredients(13)).toEqual([]);
    expect(seasonalIngredients(NaN)).toEqual([]);
    expect(seasonalIngredients(10)).toContain("さつまいも");
  });
  it("日付から月を取る", () => {
    expect(monthOfKey("2026-10-05")).toBe(10);
    expect(monthOfKey("2026-01-31")).toBe(1);
  });
});

describe("seasonalHits / rankSeasonal", () => {
  const imo = mk("1", "さつまいもごはん", "主食", ["さつまいも", "米"], ["塩"]);
  const kinoko = mk("2", "きのこの味噌汁", "汁物", ["しめじ", "しいたけ", "長ねぎ"]);
  const natsu = mk("3", "ゴーヤチャンプルー", "主菜", ["ゴーヤ", "豆腐"]);
  it("材料に旬のものがあれば、当たる(調味料は、数えない)", () => {
    expect(seasonalHits(imo, 10)).toEqual(["さつまいも"]);
    expect(seasonalHits(natsu, 10)).toEqual([]);
    expect(seasonalHits(natsu, 8)).toEqual(["ゴーヤ"]);
    expect(seasonalHits(mk("9", "塩焼き", "主菜", ["あじ"], ["さつまいも"]), 10)).toEqual([]);
  });
  it("「新玉ねぎ」は、玉ねぎの旬に、「春キャベツ」は、キャベツの旬に当たる", () => {
    expect(seasonalHits(mk("4", "サラダ", "副菜", ["新玉ねぎ"]), 6)).toEqual(["新玉ねぎ"]);
    expect(seasonalHits(mk("5", "炒め", "主菜", ["春キャベツ"]), 4)).toEqual(["春キャベツ"]);
  });
  it("旬を多く使う順。旬を使わない料理は、出さない", () => {
    const r = rankSeasonal([imo, kinoko, natsu], 10);
    expect(r.map((x) => x.recipe.id)).toEqual(["2", "1"]); // きのこ(しめじ・しいたけの2つ)が、さつまいも(1つ)より先
  });
});

describe("proposeMenu", () => {
  const rs = [
    mk("a", "さんまの塩焼き", "主菜", ["さんま"]),
    mk("b", "鮭のムニエル", "主菜", ["鮭", "しめじ"]),
    mk("c", "きのこ炒め", "副菜", ["しめじ", "えのき"]),
    mk("d", "かぼちゃの煮物", "副菜", ["かぼちゃ"]),
    mk("e", "さといもの味噌汁", "汁物", ["さといも"]),
    mk("f", "冷奴", "副菜", ["豆腐"]),
  ];
  const days = ["2026-10-05", "2026-10-06"];
  it("同じ料理は、一度だけ。旬のものだけで、主菜・副菜・汁物をそろえる", () => {
    const m = proposeMenu(rs, days);
    const ids = m.flatMap((d) => d.items.map((i) => i.recipe.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("f"); // 旬の材料がない
    expect(m[0].items.map((i) => i.slot)).toEqual(["主菜", "副菜", "汁物"]);
    expect(m[1].items.map((i) => i.slot)).toEqual(["主菜", "副菜"]); // 汁物は、1つしかない
  });
  it("旬を多く使う料理が先(主菜は、鮭+しめじ)", () => {
    expect(proposeMenu(rs, days)[0].items[0].recipe.id).toBe("b");
  });
  it("seed を変えると、同じ数の中で、順番が変わる", () => {
    const same = [mk("x1", "A", "主菜", ["さんま"]), mk("x2", "B", "主菜", ["さんま"]), mk("x3", "C", "主菜", ["さんま"])];
    const firsts = new Set(Array.from({ length: 12 }, (_, s) => proposeMenu(same, ["2026-10-05"], s)[0].items[0].recipe.id));
    expect(firsts.size).toBeGreaterThan(1);
    // 同じ seed なら、いつも同じ
    expect(proposeMenu(same, ["2026-10-05"], 3)).toEqual(proposeMenu(same, ["2026-10-05"], 3));
  });
  it("レシピが空・旬が合わない時は、日ごとの items が空", () => {
    expect(proposeMenu([], days)).toEqual([{ date: days[0], items: [] }, { date: days[1], items: [] }]);
    expect(proposeMenu([mk("g", "ゴーヤ", "主菜", ["ゴーヤ"])], ["2026-12-01"])[0].items).toEqual([]);
    expect(proposeMenu(rs, [])).toEqual([]);
  });
  it("月をまたぐ日付は、その日の月の旬で選ぶ", () => {
    const rs2 = [mk("o", "さんま", "主菜", ["さんま"]), mk("n", "ぶり大根", "主菜", ["ぶり", "大根"])];
    const m = proposeMenu(rs2, ["2026-10-31", "2026-11-01"]);
    expect(m[0].items[0].recipe.id).toBe("o");
    expect(m[1].items[0].recipe.id).toBe("n");
  });
});
