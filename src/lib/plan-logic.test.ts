import { describe, expect, it } from "vitest";
import { isMissingTableError, mergePlanRemote, planFromRow, planToRow } from "./plan-logic";
import type { PlanEntry } from "./plan";

const e = (id: string, date = "2026-10-05", recipeId = "r1", servings: number | null = null): PlanEntry => ({ id, date, recipeId, servings });

describe("サーバーの行との変換", () => {
  it("往復しても同じ", () => {
    const x = e("a", "2026-10-05", "r1", 4);
    expect(planFromRow({ ...planToRow(x) })).toEqual(x);
    expect(planFromRow(planToRow(e("b")))?.servings).toBeNull();
  });
  it("壊れた行は null(他の行は読める)", () => {
    expect(planFromRow({ id: "a", plan_date: "2026-02-30", data: { recipeId: "r" } })).toBeNull();
    expect(planFromRow({ id: "a", plan_date: "2026-10-05", data: null })).toBeNull();
    expect(planFromRow({ id: "a", plan_date: "2026-10-05", data: { recipeId: 5 } })).toBeNull();
  });
});

describe("mergePlanRemote", () => {
  it("サーバーが基本: 別の端末での追加・変更・削除が反映される", () => {
    const local = [e("a"), e("b")];
    const remote = [e("a", "2026-10-06"), e("c")];
    expect(mergePlanRemote(local, remote, []).map((x) => `${x.id}:${x.date}`)).toEqual(["c:2026-10-05", "a:2026-10-06"]);
  });
  it("送れていない追加・変更は、端末の内容を残す", () => {
    const local = [e("a", "2026-10-09"), e("new")];
    const remote = [e("a", "2026-10-06")];
    const r = mergePlanRemote(local, remote, [{ type: "upsert", id: "a" }, { type: "upsert", id: "new" }]);
    expect(r.find((x) => x.id === "a")?.date).toBe("2026-10-09");
    expect(r.some((x) => x.id === "new")).toBe(true);
  });
  it("送れていない削除は、サーバーにあっても表示しない", () => {
    expect(mergePlanRemote([], [e("a")], [{ type: "delete", id: "a" }])).toEqual([]);
  });
  it("日付順に並ぶ", () => {
    expect(mergePlanRemote([], [e("z", "2026-10-09"), e("y", "2026-10-01")], []).map((x) => x.id)).toEqual(["y", "z"]);
  });
});

describe("isMissingTableError", () => {
  it("表がまだ無いエラーだけを見分ける", () => {
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205" })).toBe(true);
    expect(isMissingTableError({ message: "Could not find the table 'public.meal_plan' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTableError(new Error("Failed to fetch"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
