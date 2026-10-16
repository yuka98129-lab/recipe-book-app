import { describe, expect, it } from "vitest";
import { addDays, dateKey, daysBetween, formatDay, isDateKey, monthGrid, parsePlanEntry, sortEntries, todayKey, weekdayIndex } from "./plan";

describe("日付", () => {
  it("実在する日付だけ受け付ける", () => {
    expect(isDateKey("2026-10-05")).toBe(true);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-5")).toBe(false);
    expect(isDateKey(20261005)).toBe(false);
  });
  it("日数を足す(月またぎ・年またぎ・うるう年)", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-05", 6)).toBe("2026-10-11");
  });
  it("曜日(月曜始まり)と表示", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0); // 月曜
    expect(weekdayIndex("2026-10-11")).toBe(6); // 日曜
    expect(formatDay("2026-10-05")).toBe("10月5日(月)");
  });
  it("今日", () => {
    expect(todayKey(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(dateKey(2026, 0, 1)).toBe("2026-01-01");
  });
  it("月のカレンダー: 月曜始まりで、週ごとに7日", () => {
    const g = monthGrid(2026, 9); // 2026年10月: 1日は木曜、31日は土曜
    expect(g[0][0]).toBe("2026-09-28");
    expect(g[0][3]).toBe("2026-10-01");
    expect(g.at(-1)![5]).toBe("2026-10-31");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g).toHaveLength(5);
    expect(monthGrid(2027, 1)).toHaveLength(4); // 2027年2月は、月曜始まりでちょうど4週
    expect(monthGrid(2026, 7)).toHaveLength(6); // 2026年8月は、6週
  });
  it("期間の日付の一覧", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(daysBetween("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
    expect(daysBetween("2026-10-06", "2026-10-05")).toEqual([]);
    expect(daysBetween("2026-01-01", "2030-01-01")).toEqual([]); // 長すぎる
    expect(daysBetween("x", "2026-10-05")).toEqual([]);
  });
});

describe("献立の検証", () => {
  it("正しい形だけ受け付ける", () => {
    expect(parsePlanEntry({ id: "a", date: "2026-10-05", recipeId: "r", servings: 4 })).toEqual({ id: "a", date: "2026-10-05", recipeId: "r", servings: 4 });
    expect(parsePlanEntry({ id: "a", date: "2026-10-05", recipeId: "r" })?.servings).toBeNull();
    expect(parsePlanEntry({ id: "a", date: "2026-10-05", recipeId: "r", servings: 0 })?.servings).toBeNull();
    for (const bad of [null, "x", {}, { id: "", date: "2026-10-05", recipeId: "r" }, { id: "a", date: "2026-02-30", recipeId: "r" }, { id: "a", date: "2026-10-05", recipeId: 3 }]) {
      expect(parsePlanEntry(bad)).toBeNull();
    }
  });
  it("日付順に並べる", () => {
    const e = (id: string, date: string) => ({ id, date, recipeId: "r", servings: null });
    expect(sortEntries([e("b", "2026-10-06"), e("a", "2026-10-05"), e("c", "2026-10-05")]).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
