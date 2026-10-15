import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackup, parseBackup, serializeBackup } from "./backup";
import { isPhotoPath, makePhotoPath } from "./photo-path";
import { fromRow, toRow } from "./sync-logic";
import type { Recipe } from "./types";

const USER = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const PHOTO = "11111111-2222-4333-8444-555555555555";
const PATH = `${USER}/${PHOTO}.jpg`;

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r1",
  name: "鶏の照り焼き",
  category: "主菜",
  tags: ["簡単"],
  ingredients: [{ name: "鶏もも肉", quantity: "1枚" }],
  seasonings: [],
  extraGroups: [],
  steps: ["焼く"],
  createdAt: 1,
  ...over,
});

describe("写真パス", () => {
  it("ユーザーID/写真ID.jpg の形で作る", () => {
    expect(makePhotoPath(USER, PHOTO)).toBe(PATH);
  });

  it("正しい形だけを写真パスとして受け付ける", () => {
    expect(isPhotoPath(PATH)).toBe(true);
    expect(isPhotoPath(PATH.toUpperCase().replace(".JPG", ".jpg"))).toBe(true);
  });

  it("形がちがうもの・危ない値は受け付けない", () => {
    expect(isPhotoPath(undefined)).toBe(false);
    expect(isPhotoPath(123)).toBe(false);
    expect(isPhotoPath("")).toBe(false);
    expect(isPhotoPath("photo.jpg")).toBe(false);
    expect(isPhotoPath(`${USER}/${PHOTO}.png`)).toBe(false);
    expect(isPhotoPath(`../${USER}/${PHOTO}.jpg`)).toBe(false);
    expect(isPhotoPath(`${USER}/../${PHOTO}.jpg`)).toBe(false);
    expect(isPhotoPath(`${USER}/${PHOTO}.jpg/extra`)).toBe(false);
  });
});

describe("サーバーの行との変換", () => {
  it("写真パスは data に入って、戻すときも残る", () => {
    const row = toRow(recipe({ photoPath: PATH }));
    expect((row.data as { photoPath?: string }).photoPath).toBe(PATH);
    expect(fromRow({ id: row.id, data: row.data })?.photoPath).toBe(PATH);
  });

  it("写真がないレシピには photoPath の項目を作らない", () => {
    const back = fromRow(toRow(recipe()));
    expect(back).not.toBeNull();
    expect("photoPath" in (back as Recipe)).toBe(false);
  });

  it("壊れた写真パスは、写真なしとして読む(レシピ自体は読める)", () => {
    const row = toRow(recipe({ photoPath: "../evil.jpg" }));
    const back = fromRow({ id: row.id, data: row.data });
    expect(back?.name).toBe("鶏の照り焼き");
    expect(back && "photoPath" in back).toBe(false);
  });
});

describe("バックアップ", () => {
  it("写真パスは書き出して、読み込んでも残る", () => {
    const text = serializeBackup(createBackup([recipe({ photoPath: PATH })], []));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.recipes[0].photoPath).toBe(PATH);
  });

  it("壊れた写真パスは捨てるが、ファイル全体は読み込める", () => {
    const text = serializeBackup(createBackup([recipe({ photoPath: "x" })], []));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect("photoPath" in parsed.backup.recipes[0]).toBe(false);
  });
});

describe("recipe-store: 読み込み", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("正しい写真パスは残し、壊れたものは落とす", async () => {
    localStorage.setItem(
      "recipes:v1",
      JSON.stringify([recipe({ id: "a", photoPath: PATH }), { ...recipe({ id: "b" }), photoPath: 42 }]),
    );
    const store = await import("./recipe-store");
    const [a, b] = store.getSnapshot().recipes;
    expect(a.photoPath).toBe(PATH);
    expect("photoPath" in b).toBe(false);
  });

  it("写真を外す更新で、保存されたレシピから写真パスが消える", async () => {
    localStorage.setItem("recipes:v1", JSON.stringify([recipe({ id: "a", photoPath: PATH })]));
    const store = await import("./recipe-store");
    const { id: _id, createdAt: _createdAt, ...input } = store.getSnapshot().recipes[0];
    void _id;
    void _createdAt;
    store.updateRecipe("a", { ...input, photoPath: undefined });
    const saved = JSON.parse(localStorage.getItem("recipes:v1") ?? "[]");
    expect("photoPath" in saved[0]).toBe(false);
  });
});
