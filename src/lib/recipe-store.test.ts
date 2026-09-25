import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "./constants";
import type { RecipeInput } from "./types";

// ストアはモジュール内にキャッシュを持つので、テストごとに読み込み直す
async function loadStore() {
  vi.resetModules();
  return import("./recipe-store");
}

const input = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  name: "親子丼",
  category: "主食",
  tags: ["時短"],
  ingredients: [{ name: "卵", quantity: "3個" }],
  seasonings: [],
  extraGroups: [],
  steps: ["煮る"],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("recipe-store: 読み込み", () => {
  it("何も保存されていなければ空のレシピと初期カテゴリーを返す", async () => {
    const store = await loadStore();
    const snap = store.getSnapshot();
    expect(snap.recipes).toEqual([]);
    expect(snap.categories).toEqual(DEFAULT_CATEGORIES);
  });

  it("壊れた JSON でも例外を投げず空として扱う", async () => {
    localStorage.setItem("recipes:v1", "{not json");
    localStorage.setItem("categories:v1", "###");
    const store = await loadStore();
    expect(store.getSnapshot().recipes).toEqual([]);
    expect(store.getSnapshot().categories).toEqual(DEFAULT_CATEGORIES);
  });

  it("形式の合わない要素は読み飛ばす", async () => {
    const valid = { id: "a", name: "x", category: "主菜", tags: [], ingredients: [], steps: [], createdAt: 1 };
    localStorage.setItem("recipes:v1", JSON.stringify([valid, { id: 1 }, null, "str"]));
    const store = await loadStore();
    expect(store.getSnapshot().recipes).toEqual([{ ...valid, seasonings: [], extraGroups: [] }]);
  });

  it("保存済みの追加カテゴリーを初期カテゴリーの後ろに並べる", async () => {
    localStorage.setItem("categories:v1", JSON.stringify(["お弁当", "主菜"]));
    const store = await loadStore();
    expect(store.getSnapshot().categories).toEqual([...DEFAULT_CATEGORIES, "お弁当"]);
  });

  it("変更がなければ同じスナップショット参照を返す(useSyncExternalStore の要件)", async () => {
    const store = await loadStore();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
  });
});

describe("recipe-store: 調味料(既存レシピとの互換性)", () => {
  const legacy = {
    id: "old",
    name: "調味料追加前のレシピ",
    category: "主菜",
    tags: [],
    ingredients: [{ name: "卵", quantity: "3個" }],
    steps: ["焼く"],
    createdAt: 1,
  };

  it("seasonings のない保存済みレシピは、調味料が空のレシピとして読み込める", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([legacy]));
    const store = await loadStore();
    expect(store.getSnapshot().recipes).toEqual([{ ...legacy, seasonings: [], extraGroups: [] }]);
  });

  it("seasonings が配列でない不正な値も [] として扱う", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([{ ...legacy, seasonings: "しょうゆ" }]));
    const store = await loadStore();
    expect(store.getSnapshot().recipes[0].seasonings).toEqual([]);
  });

  it("保存済みの調味料はそのまま読み込める", async () => {
    const seasonings = [{ name: "しょうゆ", quantity: "大さじ1" }];
    localStorage.setItem("recipes:v1", JSON.stringify([{ ...legacy, seasonings }]));
    const store = await loadStore();
    expect(store.getSnapshot().recipes[0].seasonings).toEqual(seasonings);
  });

  it("extraGroups のない保存済みレシピは、追加グループが空として読み込める", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([{ ...legacy, seasonings: [] }]));
    const store = await loadStore();
    expect(store.getSnapshot().recipes[0].extraGroups).toEqual([]);
  });

  it("extraGroups が配列でない・形式の合わない要素は取り除く", async () => {
    const good = { name: "トッピング", items: [{ name: "青ねぎ", quantity: "少々" }] };
    localStorage.setItem(
      "recipes:v1",
      JSON.stringify([
        { ...legacy, id: "a", extraGroups: "トッピング" },
        { ...legacy, id: "b", extraGroups: [good, { name: 1, items: [] }, { name: "x" }, null] },
      ]),
    );
    const store = await loadStore();
    const byId = (id: string) => store.getSnapshot().recipes.find((r) => r.id === id)!;
    expect(byId("a").extraGroups).toEqual([]);
    expect(byId("b").extraGroups).toEqual([good]);
  });

  it("追加グループは名前と中身をそのまま保存・復元できる", async () => {
    const groups = [
      { name: "トッピング", items: [{ name: "明太子", quantity: "大さじ2" }] },
      { name: "ソース", items: [{ name: "生クリーム", quantity: "100ml" }] },
    ];
    const first = await loadStore();
    first.addRecipe(input({ extraGroups: groups }));

    const second = await loadStore();
    expect(second.getSnapshot().recipes[0].extraGroups).toEqual(groups);
  });

  it("古いレシピを編集して追加グループを付けられ、材料と調味料は保たれる", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([legacy]));
    const store = await loadStore();
    const group = { name: "トッピング", items: [{ name: "青ねぎ", quantity: "少々" }] };

    store.updateRecipe(
      "old",
      input({ name: legacy.name, ingredients: legacy.ingredients, steps: legacy.steps, extraGroups: [group] }),
    );

    const stored = JSON.parse(localStorage.getItem("recipes:v1")!)[0];
    expect(stored).toMatchObject({ id: "old", ingredients: legacy.ingredients, extraGroups: [group] });
  });

  it("addRecipe は材料と調味料を別々に保存する", async () => {
    const store = await loadStore();
    store.addRecipe(
      input({ seasonings: [{ name: "塩", quantity: "少々" }] }),
    );

    const stored = JSON.parse(localStorage.getItem("recipes:v1")!)[0];
    expect(stored.ingredients).toEqual([{ name: "卵", quantity: "3個" }]);
    expect(stored.seasonings).toEqual([{ name: "塩", quantity: "少々" }]);
  });

  it("古いレシピを編集して調味料を追加でき、他の項目は保たれる", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([legacy]));
    const store = await loadStore();

    store.updateRecipe(
      "old",
      input({
        name: legacy.name,
        category: legacy.category,
        ingredients: legacy.ingredients,
        steps: legacy.steps,
        seasonings: [{ name: "しょうゆ", quantity: "大さじ1" }],
      }),
    );

    const stored = JSON.parse(localStorage.getItem("recipes:v1")!)[0];
    expect(stored).toMatchObject({
      id: "old",
      createdAt: 1,
      ingredients: legacy.ingredients,
      seasonings: [{ name: "しょうゆ", quantity: "大さじ1" }],
    });
  });

  it("調味料が未入力のまま古いレシピを編集しても、空の調味料として保存される", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([legacy]));
    const store = await loadStore();
    store.updateRecipe("old", input({ name: "名前だけ変更" }));
    expect(JSON.parse(localStorage.getItem("recipes:v1")!)[0].seasonings).toEqual([]);
  });
});

describe("recipe-store: 追加・更新・削除", () => {
  it("addRecipe は id と作成日時を付け、新しい順に先頭へ入れて保存する", async () => {
    const store = await loadStore();
    const a = store.addRecipe(input({ name: "A" }));
    const b = store.addRecipe(input({ name: "B" }));

    expect(a.id).not.toBe(b.id);
    expect(store.getSnapshot().recipes.map((r) => r.name)).toEqual(["B", "A"]);
    expect(JSON.parse(localStorage.getItem("recipes:v1")!)).toHaveLength(2);
  });

  it("新しいカテゴリーは追加され、既存・初期カテゴリーは重複しない", async () => {
    const store = await loadStore();
    store.addRecipe(input({ category: "お弁当" }));
    store.addRecipe(input({ category: "お弁当" }));
    store.addRecipe(input({ category: "主菜" }));

    expect(store.getSnapshot().categories).toEqual([...DEFAULT_CATEGORIES, "お弁当"]);
    expect(JSON.parse(localStorage.getItem("categories:v1")!)).toEqual(["お弁当"]);
  });

  it("リロード相当(モジュール再読み込み)後も内容が残る", async () => {
    const first = await loadStore();
    first.addRecipe(input({ name: "残るレシピ", category: "お弁当" }));

    const second = await loadStore();
    expect(second.getSnapshot().recipes.map((r) => r.name)).toEqual(["残るレシピ"]);
    expect(second.getSnapshot().categories).toContain("お弁当");
  });

  it("updateRecipe は対象だけを更新し、id と作成日時は保つ", async () => {
    const store = await loadStore();
    const target = store.addRecipe(input({ name: "旧" }));
    const other = store.addRecipe(input({ name: "別" }));

    store.updateRecipe(target.id, input({ name: "新", category: "汁物", tags: ["節約"] }));

    const byId = (id: string) => store.getSnapshot().recipes.find((r) => r.id === id)!;
    expect(byId(target.id)).toMatchObject({
      name: "新",
      category: "汁物",
      tags: ["節約"],
      createdAt: target.createdAt,
    });
    expect(byId(other.id).name).toBe("別");
  });

  it("updateRecipe で新しいカテゴリーを指定するとカテゴリー一覧にも入る", async () => {
    const store = await loadStore();
    const r = store.addRecipe(input());
    store.updateRecipe(r.id, input({ category: "作り置き" }));
    expect(store.getSnapshot().categories).toContain("作り置き");
  });

  it("deleteRecipe は対象だけを消す", async () => {
    const store = await loadStore();
    const a = store.addRecipe(input({ name: "A" }));
    store.addRecipe(input({ name: "B" }));

    store.deleteRecipe(a.id);
    expect(store.getSnapshot().recipes.map((r) => r.name)).toEqual(["B"]);
    expect(JSON.parse(localStorage.getItem("recipes:v1")!)).toHaveLength(1);
  });
});

describe("recipe-store: 購読", () => {
  it("変更時にリスナーが呼ばれ、解除後は呼ばれない", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.addRecipe(input());
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.addRecipe(input());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("別タブでの変更(storage イベント)を読み直して通知する", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().recipes).toEqual([]);

    const fromOtherTab = { id: "z", name: "他タブ", category: "主菜", tags: [], ingredients: [], steps: [], createdAt: 1 };
    localStorage.setItem("recipes:v1", JSON.stringify([fromOtherTab]));
    window.dispatchEvent(new StorageEvent("storage", { key: "recipes:v1" }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().recipes).toEqual([{ ...fromOtherTab, seasonings: [], extraGroups: [] }]);
  });

  it("無関係なキーの storage イベントは無視する", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("recipe-store: 保存失敗", () => {
  it("setItem が失敗したら StorageError を投げ、状態は変えず通知もしない", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getSnapshot();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => store.addRecipe(input())).toThrow(store.StorageError);
    expect(store.getSnapshot().recipes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});
