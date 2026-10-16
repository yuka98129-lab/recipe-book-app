import { describe, expect, it } from "vitest";
import { extractionToFormValues, parseExtraction } from "./recipe-extract";

const valid = {
  name: "鶏の照り焼き",
  category: "主菜",
  tags: ["簡単", "簡単", "時短", "節約", "栄養重視"],
  cookingMinutes: 20,
  servings: 2,
  ingredients: [
    { name: "鶏もも肉", quantity: "1枚" },
    { name: "", quantity: "2個" },
    { name: "片栗粉", quantity: 5 },
  ],
  seasonings: [{ name: "しょうゆ", quantity: "大さじ2" }],
  steps: ["焼く", "  ", "たれを絡める"],
  uncertain: ["分量が不明"],
};

describe("parseExtraction", () => {
  it("整った内容はそのまま取り出す(空の行・空の手順は捨て、タグは重複なしで最大3個)", () => {
    const r = parseExtraction(valid)!;
    expect(r.name).toBe("鶏の照り焼き");
    expect(r.tags).toEqual(["簡単", "時短", "節約"]);
    expect(r.ingredients).toEqual([
      { name: "鶏もも肉", quantity: "1枚" },
      { name: "片栗粉", quantity: "" }, // 文字でない分量は空にする
    ]);
    expect(r.steps).toEqual(["焼く", "たれを絡める"]);
    expect(r.cookingMinutes).toBe(20);
    expect(r.uncertain).toEqual(["分量が不明"]);
  });

  it("想定外の型は捨てる", () => {
    expect(parseExtraction(null)).toBeNull();
    expect(parseExtraction("x")).toBeNull();
    expect(parseExtraction([])).toBeNull();
    const r = parseExtraction({ name: 5, steps: "手順", ingredients: [1, null, { name: "米" }], cookingMinutes: "20" })!;
    expect(r.name).toBe("");
    expect(r.steps).toEqual([]);
    expect(r.ingredients).toEqual([{ name: "米", quantity: "" }]);
    expect(r.cookingMinutes).toBeNull();
    expect(parseExtraction({ name: 5, steps: "手順", ingredients: [1, null] })).toBeNull();
  });

  it("何も読み取れていなければ null", () => {
    expect(parseExtraction({ name: "", ingredients: [], seasonings: [], steps: [], uncertain: ["レシピが見つかりませんでした"] })).toBeNull();
  });

  it("調理時間は 1〜1440 の整数だけ", () => {
    expect(parseExtraction({ ...valid, cookingMinutes: 0 })!.cookingMinutes).toBeNull();
    expect(parseExtraction({ ...valid, cookingMinutes: 1.5 })!.cookingMinutes).toBeNull();
    expect(parseExtraction({ ...valid, cookingMinutes: 1441 })!.cookingMinutes).toBeNull();
    expect(parseExtraction({ ...valid, cookingMinutes: null })!.cookingMinutes).toBeNull();
  });

  it("人数は 1〜100 の整数だけ", () => {
    expect(parseExtraction(valid)!.servings).toBe(2);
    for (const bad of [0, 101, 2.5, "2", null]) expect(parseExtraction({ ...valid, servings: bad })!.servings).toBeNull();
  });

  it("長すぎる文字は切る", () => {
    const r = parseExtraction({ ...valid, name: "あ".repeat(500), steps: ["い".repeat(5000)] })!;
    expect(r.name).toHaveLength(100);
    expect(r.steps[0]).toHaveLength(1000);
  });

  it("行数も制限する", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ name: `材料${i}`, quantity: "1" }));
    expect(parseExtraction({ ...valid, ingredients: many })!.ingredients).toHaveLength(60);
  });
});

describe("extractionToFormValues", () => {
  const base = parseExtraction(valid)!;

  it("候補にあるカテゴリーだけ使う", () => {
    expect(extractionToFormValues(base, ["主菜", "副菜"]).category).toBe("主菜");
    expect(extractionToFormValues(base, ["副菜"]).category).toBeNull();
    expect(extractionToFormValues({ ...base, category: null }, ["主菜"]).category).toBeNull();
  });

  it("空のところは、フォームと同じ空の1行から始める", () => {
    const v = extractionToFormValues({ ...base, seasonings: [], steps: [], cookingMinutes: null, servings: null }, []);
    expect(v.seasonings).toEqual([{ name: "", quantity: "" }]);
    expect(v.steps).toEqual([""]);
    expect(v.cookingMinutes).toBe("");
    expect(v.servings).toBe("");
    expect(extractionToFormValues(base, []).servings).toBe("2");
  });

  it("調理時間は文字にする", () => {
    expect(extractionToFormValues(base, []).cookingMinutes).toBe("20");
  });
});
