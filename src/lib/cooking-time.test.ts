import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, serializeBackup } from "./backup";
import { formatMinutes, isCookingMinutes, parseCookingMinutes } from "./cooking-time";
import { fromRow, toRow } from "./sync-logic";
import type { Recipe } from "./types";

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r1",
  name: "親子丼",
  category: "主食",
  tags: [],
  ingredients: [{ name: "卵", quantity: "3個" }],
  seasonings: [],
  extraGroups: [],
  steps: ["煮る"],
  createdAt: 1,
  ...over,
});

describe("調理時間の入力", () => {
  it("空欄は未入力(undefined)", () => {
    expect(parseCookingMinutes("")).toBeUndefined();
    expect(parseCookingMinutes("   ")).toBeUndefined();
  });

  it("半角・全角の整数を受け付ける", () => {
    expect(parseCookingMinutes("15")).toBe(15);
    expect(parseCookingMinutes(" 30 ")).toBe(30);
    expect(parseCookingMinutes("４５")).toBe(45);
    expect(parseCookingMinutes("1440")).toBe(1440);
  });

  it("0・負の数・小数・文字・上限超えは正しくない(null)", () => {
    for (const bad of ["0", "-5", "1.5", "15分", "abc", "1441", "１e3"]) {
      expect(parseCookingMinutes(bad), bad).toBeNull();
    }
  });

  it("isCookingMinutes は1〜1440の整数だけ", () => {
    expect(isCookingMinutes(1)).toBe(true);
    expect(isCookingMinutes(1440)).toBe(true);
    for (const bad of [0, 1441, 2.5, NaN, Infinity, "15", null, undefined]) {
      expect(isCookingMinutes(bad)).toBe(false);
    }
  });
});

describe("調理時間の表示", () => {
  it("分・時間・時間と分", () => {
    expect(formatMinutes(5)).toBe("5分");
    expect(formatMinutes(59)).toBe("59分");
    expect(formatMinutes(60)).toBe("1時間");
    expect(formatMinutes(90)).toBe("1時間30分");
    expect(formatMinutes(120)).toBe("2時間");
  });
});

describe("保存・同期・バックアップ", () => {
  it("サーバーの行を通っても残る", () => {
    expect(fromRow(toRow(recipe({ cookingMinutes: 20 })))?.cookingMinutes).toBe(20);
  });

  it("未入力のレシピには項目を作らない・壊れた値は捨てる", () => {
    const none = fromRow(toRow(recipe()));
    expect(none && "cookingMinutes" in none).toBe(false);
    const bad = fromRow(toRow(recipe({ cookingMinutes: -3 })));
    expect(bad?.name).toBe("親子丼");
    expect(bad && "cookingMinutes" in bad).toBe(false);
  });

  it("バックアップに書き出して読み込んでも残る", () => {
    const parsed = parseBackup(serializeBackup(createBackup([recipe({ cookingMinutes: 45 })], [])));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.recipes[0].cookingMinutes).toBe(45);
  });
});
