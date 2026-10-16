import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPlanEntry, getPlanSnapshot, PlanStorageError, removePlanEntry, replacePlanFromRemote, setPlanChangeHandler, setPlanServings, subscribePlan } from "./plan-store";

beforeEach(() => {
  localStorage.clear();
  replacePlanFromRemote([]);
  setPlanChangeHandler(null);
});

describe("献立の保存", () => {
  it("追加・人数の変更・削除ができて、日付順に並ぶ", () => {
    const b = addPlanEntry({ date: "2026-10-06", recipeId: "r2", servings: null });
    const a = addPlanEntry({ date: "2026-10-05", recipeId: "r1", servings: 4 });
    expect(getPlanSnapshot().entries.map((x) => x.id)).toEqual([a.id, b.id]);
    setPlanServings(b.id, 3);
    expect(getPlanSnapshot().entries.find((x) => x.id === b.id)?.servings).toBe(3);
    setPlanServings(b.id, 0 as never); // 正しくない人数は「レシピのまま」(null)
    expect(getPlanSnapshot().entries.find((x) => x.id === b.id)?.servings).toBeNull();
    removePlanEntry(a.id);
    expect(getPlanSnapshot().entries).toHaveLength(1);
  });

  it("リロード後も残る(localStorage から読み直す)。壊れた項目は捨てる", () => {
    addPlanEntry({ date: "2026-10-05", recipeId: "r1", servings: 2 });
    const raw = JSON.parse(localStorage.getItem("plan:v1")!);
    localStorage.setItem("plan:v1", JSON.stringify([...raw, { id: "x", date: "2026-02-30", recipeId: "r" }, "junk", null]));
    window.dispatchEvent(new StorageEvent("storage", { key: "plan:v1" })); // 別タブの変更の通知と同じ(購読中でなくても cache は無効化されない)
    const off = subscribePlan(() => {});
    window.dispatchEvent(new StorageEvent("storage", { key: "plan:v1" }));
    expect(getPlanSnapshot().entries).toHaveLength(1);
    off();
  });

  it("変更を同期に知らせる(追加・変更は upsert、削除は delete)", () => {
    const handler = vi.fn();
    setPlanChangeHandler(handler);
    const a = addPlanEntry({ date: "2026-10-05", recipeId: "r1", servings: null });
    setPlanServings(a.id, 2);
    removePlanEntry(a.id);
    expect(handler.mock.calls.map((c) => c[0][0])).toEqual([
      { type: "upsert", id: a.id }, { type: "upsert", id: a.id }, { type: "delete", id: a.id },
    ]);
  });

  it("サーバーからの置き換えでは、同期に知らせない", () => {
    const handler = vi.fn();
    setPlanChangeHandler(handler);
    replacePlanFromRemote([{ id: "a", date: "2026-10-05", recipeId: "r", servings: null }]);
    expect(handler).not.toHaveBeenCalled();
    expect(getPlanSnapshot().entries).toHaveLength(1);
  });

  it("保存できないときは PlanStorageError を投げ、状態は変わらない", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => addPlanEntry({ date: "2026-10-05", recipeId: "r1", servings: null })).toThrow(PlanStorageError);
    spy.mockRestore();
    expect(getPlanSnapshot().entries).toHaveLength(0);
  });
});
