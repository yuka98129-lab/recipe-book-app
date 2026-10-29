import { describe, expect, it } from "vitest";
import { filterRecipes } from "./filter";
import { bentoLabel, bentoOf, choiceOf, inScene, parseBento, parseScene } from "./scene";
import { parseBackup } from "./backup";
import { fromRow, toRow } from "./sync-logic";
import type { Recipe } from "./types";

const mk = (id: string, name: string, bento?: Recipe["bento"], ing = "卵"): Recipe => ({
  id, name, category: "副菜", tags: [], ingredients: [{ name: ing, quantity: "2個" }], seasonings: [], extraGroups: [], steps: ["焼く"], createdAt: 1, ...(bento ? { bento } : {}),
});

describe("お弁当との関係", () => {
  it("値の読み取り: 正しい値だけ受け付ける", () => {
    expect(parseBento("both")).toBe("both");
    expect(parseBento("only")).toBe("only");
    expect(parseBento("daily")).toBeUndefined();
    expect(parseBento(1)).toBeUndefined();
    expect(parseScene("bento")).toBe("bento");
    expect(parseScene("zzz")).toBe("");
    expect(parseScene(null)).toBe("");
  });
  it("登録画面の選択肢と、保存する値の変換", () => {
    expect(choiceOf(undefined)).toBe("daily");
    expect(bentoOf("daily")).toBeUndefined();
    expect(bentoOf("both")).toBe("both");
    expect(bentoLabel(undefined)).toBeNull();
    expect(bentoLabel("both")).toBe("お弁当にも");
    expect(bentoLabel("only")).toBe("お弁当用");
  });
  it("一覧: ふだんには お弁当用が出ず、お弁当には 兼用と お弁当用が出る", () => {
    const rs = [mk("a", "きんぴら"), mk("b", "卵焼き", "both"), mk("c", "のりチキン", "only")];
    const names = (scene: "" | "daily" | "bento") => filterRecipes(rs, { q: "", category: "", tags: [], scene }).map((r) => r.name);
    expect(names("")).toEqual(["きんぴら", "卵焼き", "のりチキン"]);
    expect(names("daily")).toEqual(["きんぴら", "卵焼き"]);
    expect(names("bento")).toEqual(["卵焼き", "のりチキン"]);
    expect(inScene({}, "bento")).toBe(false);
  });
  it("検索・絞り込みと、いっしょに使える", () => {
    const rs = [mk("a", "きんぴら", undefined, "ごぼう"), mk("b", "卵焼き", "both"), mk("c", "卵サンド", "only")];
    expect(filterRecipes(rs, { q: "卵", category: "", tags: [], scene: "bento" }).map((r) => r.name)).toEqual(["卵焼き", "卵サンド"]);
    expect(filterRecipes(rs, { q: "卵", category: "", tags: [], scene: "daily" }).map((r) => r.name)).toEqual(["卵焼き"]);
  });
  it("クラウド保存の往復で、印が残る(壊れた値は、ふだん用になる)", () => {
    const back = fromRow({ id: "b", data: toRow(mk("b", "卵焼き", "both")).data });
    expect(back?.bento).toBe("both");
    const bad = fromRow({ id: "x", data: { ...toRow(mk("x", "x")).data, bento: "zzz" } });
    expect(bad && "bento" in bad).toBe(false);
  });
  it("バックアップの往復で、印が残る(古いファイルは、ふだん用)", () => {
    const text = JSON.stringify({ app: "recipe-book", version: 1, exportedAt: "2026-01-01", recipes: [mk("b", "卵焼き", "only"), mk("a", "きんぴら")], customCategories: [] });
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.recipes.find((x) => x.id === "b")?.bento).toBe("only");
      expect(r.backup.recipes.find((x) => x.id === "a")?.bento).toBeUndefined();
    }
  });
});
