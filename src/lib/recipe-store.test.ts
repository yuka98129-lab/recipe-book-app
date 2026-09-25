import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "./constants";
import type { BackupFile } from "./backup";
import type { Recipe, RecipeInput } from "./types";

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

describe("recipe-store: バックアップの取り込み", () => {
  const backupOf = (recipes: Recipe[], customCategories: string[] = []): BackupFile => ({
    app: "recipe-book",
    version: 1,
    exportedAt: "",
    recipes,
    customCategories,
  });
  const rec = (id: string, over: Partial<Recipe> = {}): Recipe => ({
    id,
    name: `レシピ${id}`,
    category: "主菜",
    tags: [],
    ingredients: [{ name: "卵", quantity: "3個" }],
    seasonings: [],
    extraGroups: [],
    steps: ["焼く"],
    createdAt: 100,
    ...over,
  });

  it("追加: いまのレシピを残してファイルのレシピを加え、保存にも反映される", async () => {
    const store = await loadStore();
    const mine = store.addRecipe(input({ name: "自分のレシピ" }));

    const result = store.importBackup(backupOf([rec("x", { createdAt: 1 })]), "add");

    expect(result).toEqual({ added: 1, skipped: 0 });
    expect(store.getSnapshot().recipes.map((r) => r.id).sort()).toEqual([mine.id, "x"].sort());
    expect(JSON.parse(localStorage.getItem("recipes:v1")!)).toHaveLength(2);
  });

  it("追加: 登録済みの同じ id は飛ばし、内容を書き換えない", async () => {
    const store = await loadStore();
    const mine = store.addRecipe(input({ name: "編集済み" }));

    const result = store.importBackup(backupOf([rec(mine.id, { name: "古い内容" }), rec("y")]), "add");

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(store.getSnapshot().recipes.find((r) => r.id === mine.id)!.name).toBe("編集済み");
  });

  it("上書き: いまのレシピをすべてファイルの内容に置き換える", async () => {
    const store = await loadStore();
    store.addRecipe(input({ name: "消えるレシピ" }));

    const result = store.importBackup(backupOf([rec("x"), rec("y")]), "replace");

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(store.getSnapshot().recipes.map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("カテゴリー: ファイルのカテゴリーとレシピのカテゴリーを取り込む", async () => {
    const store = await loadStore();
    store.importBackup(backupOf([rec("x", { category: "作り置き" })], ["お弁当"]), "add");
    expect(store.getSnapshot().categories).toEqual([...DEFAULT_CATEGORIES, "お弁当", "作り置き"]);
  });

  it("上書きでは、いまだけにあった追加カテゴリーは残らない", async () => {
    const store = await loadStore();
    store.addRecipe(input({ category: "古いカテゴリー" }));
    store.importBackup(backupOf([rec("x")]), "replace");
    expect(store.getSnapshot().categories).toEqual(DEFAULT_CATEGORIES);
  });

  it("取り込んだ内容はリロード相当(モジュール再読み込み)後も残る", async () => {
    const first = await loadStore();
    first.importBackup(backupOf([rec("x", { seasonings: [{ name: "塩", quantity: "少々" }] })], ["お弁当"]), "replace");

    const second = await loadStore();
    expect(second.getSnapshot().recipes[0].seasonings).toEqual([{ name: "塩", quantity: "少々" }]);
    expect(second.getSnapshot().categories).toContain("お弁当");
  });

  it("書き出し→(全消去)→読み込みで、元のレシピに戻る", async () => {
    const { createBackup, parseBackup, serializeBackup } = await import("./backup");
    const first = await loadStore();
    first.addRecipe(input({ name: "A", category: "お弁当", seasonings: [{ name: "塩", quantity: "少々" }] }));
    first.addRecipe(input({ name: "B", extraGroups: [{ name: "トッピング", items: [{ name: "青ねぎ", quantity: "適量" }] }] }));
    const before = first.getSnapshot();
    const text = serializeBackup(createBackup(before.recipes, before.categories));

    localStorage.clear();
    const second = await loadStore();
    expect(second.getSnapshot().recipes).toEqual([]);

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    second.importBackup(parsed.backup, "add");

    expect(second.getSnapshot().recipes).toEqual(before.recipes);
    expect(second.getSnapshot().categories).toEqual(before.categories);
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

  it("2つ目の保存で失敗したら、1つ目の保存も元に戻す(レシピとカテゴリーが食い違わない)", async () => {
    const store = await loadStore();
    store.addRecipe(input({ name: "既存", category: "お弁当" }));
    const recipesBefore = localStorage.getItem("recipes:v1");
    const categoriesBefore = localStorage.getItem("categories:v1");

    const realSetItem = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      calls += 1;
      if (calls === 2) throw new DOMException("quota", "QuotaExceededError"); // カテゴリーの保存で失敗
      realSetItem.call(this, k, v);
    });

    expect(() => store.addRecipe(input({ name: "新規", category: "新カテゴリー" }))).toThrow(store.StorageError);

    vi.restoreAllMocks();
    expect(localStorage.getItem("recipes:v1")).toBe(recipesBefore);
    expect(localStorage.getItem("categories:v1")).toBe(categoriesBefore);
    expect(store.getSnapshot().recipes.map((r) => r.name)).toEqual(["既存"]);
  });

  it("取り込みで保存に失敗しても、いまのデータは変わらない", async () => {
    const store = await loadStore();
    store.addRecipe(input({ name: "既存" }));
    const before = localStorage.getItem("recipes:v1");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const backup = { app: "recipe-book" as const, version: 1, exportedAt: "", customCategories: [], recipes: [
      { id: "x", name: "x", category: "主菜", tags: [], ingredients: [], seasonings: [], extraGroups: [], steps: [], createdAt: 1 },
    ] };

    expect(() => store.importBackup(backup, "replace")).toThrow(store.StorageError);
    vi.restoreAllMocks();
    expect(localStorage.getItem("recipes:v1")).toBe(before);
    expect(store.getSnapshot().recipes.map((r) => r.name)).toEqual(["既存"]);
  });
});
