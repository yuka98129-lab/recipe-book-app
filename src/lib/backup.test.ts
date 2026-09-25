import { describe, expect, it } from "vitest";
import {
  BACKUP_APP,
  BACKUP_VERSION,
  backupFileName,
  createBackup,
  mergeCategoryNames,
  mergeRecipes,
  parseBackup,
  serializeBackup,
} from "./backup";
import { DEFAULT_CATEGORIES } from "./constants";
import type { Recipe } from "./types";

const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({
  id,
  name: `レシピ${id}`,
  category: "主菜",
  tags: ["時短"],
  ingredients: [{ name: "卵", quantity: "3個" }],
  seasonings: [{ name: "塩", quantity: "少々" }],
  extraGroups: [{ name: "トッピング", items: [{ name: "青ねぎ", quantity: "適量" }] }],
  steps: ["焼く"],
  createdAt: 100,
  ...over,
});

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-25T04:00:00.000Z",
    recipes: [recipe("a")],
    customCategories: [],
    ...over,
  });

describe("createBackup / serializeBackup", () => {
  it("全レシピと、初期カテゴリー以外のカテゴリーを含める", () => {
    const b = createBackup([recipe("a")], [...DEFAULT_CATEGORIES, "お弁当"], new Date("2026-09-25T04:00:00Z"));
    expect(b).toMatchObject({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: "2026-09-25T04:00:00.000Z",
      customCategories: ["お弁当"],
    });
    expect(b.recipes).toHaveLength(1);
  });

  it("書き出した内容を、そのまま読み込み直すと同じレシピに戻る(往復)", () => {
    const recipes = [
      recipe("a"),
      recipe("b", { seasonings: [], extraGroups: [], tags: [], createdAt: 5 }),
    ];
    const text = serializeBackup(createBackup(recipes, [...DEFAULT_CATEGORIES, "お弁当"]));
    const result = parseBackup(text);
    expect(result.ok && result.backup.recipes).toEqual(recipes);
    expect(result.ok && result.backup.customCategories).toEqual(["お弁当"]);
  });
});

describe("backupFileName", () => {
  it("端末の日付でファイル名を作る(月日は2桁)", () => {
    expect(backupFileName(new Date(2026, 8, 5))).toBe("recipe-book-backup-2026-09-05.json");
  });
});

describe("parseBackup: 正しいファイル", () => {
  it("調味料・追加グループのない古い形式のレシピも読み込める(空として補う)", () => {
    const old = { id: "o", name: "古い", category: "主菜", tags: [], ingredients: [], steps: [], createdAt: 1 };
    const r = parseBackup(file({ recipes: [old] }));
    expect(r.ok && r.backup.recipes[0]).toMatchObject({ seasonings: [], extraGroups: [] });
  });

  it("customCategories や exportedAt が無くても読み込める", () => {
    const r = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, recipes: [recipe("a")] }));
    expect(r.ok && r.backup.customCategories).toEqual([]);
  });

  it("未知の項目は取り込まない(必要な項目だけを取り出す)", () => {
    const r = parseBackup(file({ recipes: [{ ...recipe("a"), evil: "x", __proto__: { polluted: true } }] }));
    expect(r.ok && Object.keys(r.backup.recipes[0]).sort()).toEqual(
      ["category", "createdAt", "extraGroups", "id", "ingredients", "name", "seasonings", "steps", "tags"],
    );
  });

  it("レシピが0件のファイルとして読み込める(扱いは画面側で決める)", () => {
    const r = parseBackup(file({ recipes: [] }));
    expect(r.ok && r.backup.recipes).toEqual([]);
  });
});

describe("parseBackup: 形式がおかしいファイルはエラーにする", () => {
  const errorOf = (text: string) => {
    const r = parseBackup(text);
    if (r.ok) throw new Error("エラーになるはずが成功した");
    return r.error;
  };

  it("JSON として壊れている", () => {
    expect(errorOf("{ こわれた")).toContain("JSON");
    expect(errorOf("")).toContain("JSON");
  });

  it("このアプリのバックアップではない", () => {
    expect(errorOf(JSON.stringify({ recipes: [] }))).toContain("バックアップファイルではありません");
    expect(errorOf(JSON.stringify([1, 2]))).toContain("バックアップファイルではありません");
    expect(errorOf("null")).toContain("バックアップファイルではありません");
    expect(errorOf(file({ app: "other-app" }))).toContain("バックアップファイルではありません");
  });

  it("バージョンが不正・新しすぎる", () => {
    expect(errorOf(file({ version: "1" }))).toContain("バージョン");
    expect(errorOf(file({ version: 0 }))).toContain("バージョン");
    expect(errorOf(file({ version: BACKUP_VERSION + 1 }))).toContain("更新");
  });

  it("recipes が配列でない", () => {
    expect(errorOf(file({ recipes: {} }))).toContain("レシピのデータ");
  });

  it("レシピの項目が不正なら、何件目のどの項目かを示す", () => {
    const bad = (over: Record<string, unknown>) => errorOf(file({ recipes: [recipe("a"), { ...recipe("b"), ...over }] }));
    expect(bad({ name: "" })).toContain("2件目");
    expect(bad({ name: "" })).toContain("料理名");
    expect(bad({ id: 1 })).toContain("id");
    expect(bad({ category: null })).toContain("カテゴリー");
    expect(bad({ tags: "時短" })).toContain("タグ");
    expect(bad({ tags: [1] })).toContain("タグ");
    expect(bad({ ingredients: [{ name: "卵" }] })).toContain("材料");
    expect(bad({ seasonings: "塩" })).toContain("調味料");
    expect(bad({ extraGroups: [{ name: "", items: [] }] })).toContain("材料グループ");
    expect(bad({ extraGroups: [{ name: "x", items: "y" }] })).toContain("材料グループ");
    expect(bad({ steps: [1] })).toContain("手順");
    expect(bad({ createdAt: "昨日" })).toContain("作成日時");
    expect(bad({ name: "" })).not.toContain("「」");
  });

  it("レシピが配列でない・null の場合", () => {
    expect(errorOf(file({ recipes: [null] }))).toContain("1件目");
    expect(errorOf(file({ recipes: ["x"] }))).toContain("1件目");
  });

  it("1件でも不正があれば全体を受け付けない(途中まで読み込まない)", () => {
    const r = parseBackup(file({ recipes: [recipe("a"), recipe("b"), { id: "c" }] }));
    expect(r.ok).toBe(false);
  });

  it("ファイル内で id が重複している", () => {
    expect(errorOf(file({ recipes: [recipe("a"), recipe("a")] }))).toContain("重複");
  });

  it("customCategories が不正", () => {
    expect(errorOf(file({ customCategories: "お弁当" }))).toContain("カテゴリー");
    expect(errorOf(file({ customCategories: [1] }))).toContain("カテゴリー");
  });
});

describe("mergeRecipes(追加)", () => {
  it("登録済みはそのまま残し、新しいレシピだけを加える", () => {
    const existing = [recipe("a", { createdAt: 300 })];
    const r = mergeRecipes(existing, [recipe("b", { createdAt: 200 })]);
    expect(r.recipes.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r).toMatchObject({ added: 1, skipped: 0 });
  });

  it("同じ id は登録済みとして飛ばす(登録済みの内容は変えない)", () => {
    const existing = [recipe("a", { name: "編集後", createdAt: 300 })];
    const r = mergeRecipes(existing, [recipe("a", { name: "バックアップ時点" }), recipe("b", { createdAt: 50 })]);
    expect(r.recipes.find((x) => x.id === "a")!.name).toBe("編集後");
    expect(r).toMatchObject({ added: 1, skipped: 1 });
  });

  it("同じファイルを続けて2回追加しても増えない", () => {
    const incoming = [recipe("a"), recipe("b")];
    const once = mergeRecipes([], incoming);
    const twice = mergeRecipes(once.recipes, incoming);
    expect(twice.recipes).toHaveLength(2);
    expect(twice).toMatchObject({ added: 0, skipped: 2 });
  });

  it("新しい順(作成日時の降順)に並べ、元の配列は変更しない", () => {
    const existing = [recipe("old", { createdAt: 10 })];
    const r = mergeRecipes(existing, [recipe("new", { createdAt: 99 })]);
    expect(r.recipes.map((x) => x.id)).toEqual(["new", "old"]);
    expect(existing).toHaveLength(1);
  });
});

describe("mergeCategoryNames", () => {
  it("重複を除いて順序を保つ", () => {
    expect(mergeCategoryNames(["主菜", "副菜"], ["副菜", "お弁当"], [])).toEqual(["主菜", "副菜", "お弁当"]);
  });
});
