import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, serializeBackup } from "./backup";
import {
  emptyValues, formatAmount, isNutritionCurrent, nutritionBasis, parseNutritionItems,
  parseStoredNutrition, perServing, pfcShare, totalNutrition, vegetableGrams, type NutritionEstimate,
} from "./nutrition";
import { fromRow, toRow } from "./sync-logic";
import type { Recipe } from "./types";

const item = (over: Record<string, unknown> = {}) => ({
  name: "玉ねぎ", grams: 200, isVegetable: true,
  energyKcal: 74, proteinG: 2, fatG: 0.2, carbG: 17.6, calciumMg: 44, ironMg: 0.4, vitaminAUg: 0, vitaminCMg: 14, vitaminDUg: 0, note: "1個=200g", ...over,
});

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r1", name: "親子丼", category: "主食", tags: [],
  ingredients: [{ name: "玉ねぎ", quantity: "1個" }], seasonings: [], extraGroups: [], steps: ["煮る"], createdAt: 1, ...over,
});

function estimate(r: Recipe): NutritionEstimate {
  return { items: parseNutritionItems([item(), item({ name: "じゃがいも", grams: 150, isVegetable: false, energyKcal: 114 })]), assumptions: ["油は考えていない"], basis: nutritionBasis(r), usedPhoto: false, estimatedAt: 1000 };
}

describe("parseNutritionItems", () => {
  it("整った行を取り出す", () => {
    const [it0] = parseNutritionItems([item()]);
    expect(it0.name).toBe("玉ねぎ");
    expect(it0.values.energyKcal).toBe(74);
    expect(it0.isVegetable).toBe(true);
  });

  it("名前がない行・値が1つも読めない行・型が違う行は捨てる", () => {
    expect(parseNutritionItems([item({ name: "" }), null, "x", { name: "水" }])).toEqual([]);
    expect(parseNutritionItems("x")).toEqual([]);
  });

  it("負の値・極端に大きい値・文字は 0 扱い(その栄養素だけ)", () => {
    const [r] = parseNutritionItems([item({ energyKcal: -5, proteinG: 1e9, fatG: "3", carbG: NaN })]);
    expect(r.values.energyKcal).toBe(0);
    expect(r.values.proteinG).toBe(0);
    expect(r.values.fatG).toBe(0);
    expect(r.values.carbG).toBe(0);
    expect(r.values.calciumMg).toBe(44);
  });

  it("重さが変なら null、isVegetable は true のときだけ true", () => {
    expect(parseNutritionItems([item({ grams: -1 })])[0].grams).toBeNull();
    expect(parseNutritionItems([item({ grams: 99999 })])[0].grams).toBeNull();
    expect(parseNutritionItems([item({ isVegetable: "true" })])[0].isVegetable).toBe(false);
  });

  it("行数を制限する", () => {
    expect(parseNutritionItems(Array.from({ length: 200 }, () => item()))).toHaveLength(80);
  });
});

describe("集計", () => {
  const est = estimate(recipe());
  it("合計は材料ごとの値の和", () => {
    expect(totalNutrition(est.items).energyKcal).toBe(188);
    expect(totalNutrition([])).toEqual(emptyValues());
  });
  it("野菜の量は、野菜の行の重さだけ足す(重さ不明の行は無視)", () => {
    expect(vegetableGrams(est.items)).toBe(200);
    expect(vegetableGrams(parseNutritionItems([item({ grams: null }), item({ grams: 50 })]))).toBe(50);
  });
  it("1人分は人数で割る", () => {
    expect(perServing(totalNutrition(est.items), 4).energyKcal).toBe(47);
  });
  it("表示の数字", () => {
    expect(formatAmount(1234.5, 0)).toBe("1,235");
    expect(formatAmount(0, 1)).toBe("0.0");
    expect(formatAmount(0.04, 1)).toBe("<0.1");
    expect(formatAmount(3.14159, 1)).toBe("3.1");
  });
});

describe("PFCバランス", () => {
  it("エネルギーの割合(%)で、足して100になる", () => {
    // たんぱく質20g=80kcal、脂質10g=90kcal、炭水化物30g=120kcal → 合計290
    expect(pfcShare({ proteinG: 20, fatG: 10, carbG: 30 })).toEqual({ p: 28, f: 31, c: 41 });
    const s = pfcShare({ proteinG: 1, fatG: 1, carbG: 1 })!;
    expect(s.p + s.f + s.c).toBe(100);
  });
  it("3つとも0・不正な値なら null", () => {
    expect(pfcShare({ proteinG: 0, fatG: 0, carbG: 0 })).toBeNull();
    expect(pfcShare({ proteinG: NaN, fatG: 0, carbG: 0 })).toBeNull();
  });
});

describe("材料が変わったかの印", () => {
  it("名前・分量が変わると変わり、同じなら同じ", () => {
    const r = recipe();
    expect(nutritionBasis(r)).toBe(nutritionBasis(recipe()));
    expect(nutritionBasis(r)).not.toBe(nutritionBasis(recipe({ ingredients: [{ name: "玉ねぎ", quantity: "2個" }] })));
    expect(nutritionBasis(r)).not.toBe(nutritionBasis(recipe({ seasonings: [{ name: "塩", quantity: "少々" }] })));
    expect(isNutritionCurrent(r, estimate(r))).toBe(true);
    expect(isNutritionCurrent(recipe({ ingredients: [] }), estimate(r))).toBe(false);
  });
});

describe("保存と読み込み", () => {
  const r = recipe();
  const withNut = recipe({ nutrition: estimate(r) });

  it("同期の行・バックアップを往復しても残る", () => {
    expect(fromRow(toRow(withNut))?.nutrition?.items).toHaveLength(2);
    const parsed = parseBackup(serializeBackup(createBackup([withNut], [])));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.recipes[0].nutrition?.assumptions).toEqual(["油は考えていない"]);
  });

  it("壊れた推定は捨てる(レシピ自体は読み込める)", () => {
    expect(parseStoredNutrition({ items: [], basis: "a", estimatedAt: 1 })).toBeUndefined();
    expect(parseStoredNutrition({ items: [item()], basis: 5, estimatedAt: 1 })).toBeUndefined();
    expect(parseStoredNutrition({ items: [item()], basis: "a", estimatedAt: "x" })).toBeUndefined();
    expect(parseStoredNutrition(null)).toBeUndefined();
    const bad = fromRow(toRow({ ...r, nutrition: { items: "x" } as never }));
    expect(bad && "nutrition" in bad).toBe(false);
  });
});
