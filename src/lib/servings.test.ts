import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, serializeBackup } from "./backup";
import { formatServings, isServings, parseServings } from "./servings";
import { fromRow, toRow } from "./sync-logic";
import type { Recipe } from "./types";

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r1", name: "親子丼", category: "主食", tags: [],
  ingredients: [{ name: "卵", quantity: "3個" }], seasonings: [], extraGroups: [], steps: ["煮る"], createdAt: 1, ...over,
});

describe("人数の入力", () => {
  it("空欄は未入力、全角や「人分」付きも受け付ける", () => {
    expect(parseServings("")).toBeUndefined();
    expect(parseServings("  ")).toBeUndefined();
    expect(parseServings("2")).toBe(2);
    expect(parseServings("４")).toBe(4);
    expect(parseServings("3人分")).toBe(3);
    expect(parseServings("100")).toBe(100);
  });

  it("正しくない値は null", () => {
    for (const t of ["0", "101", "-1", "1.5", "二人", "2〜3", "abc"]) expect(parseServings(t)).toBeNull();
  });

  it("判定と表示", () => {
    expect(isServings(1)).toBe(true);
    expect(isServings(0)).toBe(false);
    expect(isServings("2")).toBe(false);
    expect(formatServings(2)).toBe("2人分");
  });
});

describe("人数の保存", () => {
  it("同期の行・バックアップを往復しても残る。壊れた値は捨てる", () => {
    expect(fromRow(toRow(recipe({ servings: 2 })))?.servings).toBe(2);
    expect("servings" in (fromRow(toRow(recipe()))!)).toBe(false);
    expect("servings" in (fromRow(toRow(recipe({ servings: -3 })))!)).toBe(false);
    const parsed = parseBackup(serializeBackup(createBackup([recipe({ servings: 4 })], [])));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.recipes[0].servings).toBe(4);
  });
});
