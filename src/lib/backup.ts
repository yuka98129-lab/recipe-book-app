import { DEFAULT_CATEGORIES } from "./constants";
import type { Ingredient, IngredientGroup, Recipe } from "./types";

export const BACKUP_APP = "recipe-book";
export const BACKUP_VERSION = 1;
/** 想像を超えて大きいファイルで画面が固まらないようにする上限 */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export type BackupFile = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  recipes: Recipe[];
  /** 初期カテゴリー以外に、ユーザーが追加したカテゴリー */
  customCategories: string[];
};

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

export function createBackup(
  recipes: Recipe[],
  categories: string[],
  now: Date = new Date(),
): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    recipes,
    customCategories: categories.filter((c) => !DEFAULT_CATEGORIES.includes(c)),
  };
}

export const serializeBackup = (backup: BackupFile) => JSON.stringify(backup, null, 2);

/** 例: recipe-book-backup-2026-09-25.json(端末の現地日付) */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `recipe-book-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// --- 読み込み時の検証 ---

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isNonEmptyText = (v: unknown): v is string => isText(v) && v.trim() !== "";

function parseIngredient(v: unknown): Ingredient | null {
  if (!isRecord(v) || !isText(v.name) || !isText(v.quantity)) return null;
  return { name: v.name, quantity: v.quantity };
}

function parseIngredientList(v: unknown): Ingredient[] | null {
  if (!Array.isArray(v)) return null;
  const items = v.map(parseIngredient);
  return items.every((i): i is Ingredient => i !== null) ? items : null;
}

function parseGroups(v: unknown): IngredientGroup[] | null {
  if (!Array.isArray(v)) return null;
  const groups: IngredientGroup[] = [];
  for (const g of v) {
    if (!isRecord(g) || !isNonEmptyText(g.name)) return null;
    const items = parseIngredientList(g.items);
    if (!items) return null;
    groups.push({ name: g.name, items });
  }
  return groups;
}

/** 問題があれば「どの項目か」を返す。正しければ、既知の項目だけを取り出した Recipe を返す */
function parseRecipe(v: unknown): { recipe: Recipe } | { problem: string } {
  if (!isRecord(v)) return { problem: "レシピの形式" };
  if (!isNonEmptyText(v.id)) return { problem: "id" };
  if (!isNonEmptyText(v.name)) return { problem: "料理名" };
  if (!isNonEmptyText(v.category)) return { problem: "カテゴリー" };
  if (!Array.isArray(v.tags) || !v.tags.every(isText)) return { problem: "タグ" };
  const ingredients = parseIngredientList(v.ingredients);
  if (!ingredients) return { problem: "材料" };
  // 調味料・追加グループは後から追加した項目。古いバックアップには無い
  const seasonings = v.seasonings === undefined ? [] : parseIngredientList(v.seasonings);
  if (!seasonings) return { problem: "調味料" };
  const extraGroups = v.extraGroups === undefined ? [] : parseGroups(v.extraGroups);
  if (!extraGroups) return { problem: "材料グループ" };
  if (!Array.isArray(v.steps) || !v.steps.every(isText)) return { problem: "手順" };
  if (v.createdAt !== undefined && (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt))) {
    return { problem: "作成日時" };
  }

  return {
    recipe: {
      id: v.id,
      name: v.name,
      category: v.category,
      tags: [...(v.tags as string[])],
      ingredients,
      seasonings,
      extraGroups,
      steps: [...(v.steps as string[])],
      createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
    },
  };
}

/**
 * バックアップファイルの中身(テキスト)を検証して読み込む。
 * 1件でも不正があればファイル全体を受け付けない(途中まで読み込んでデータが中途半端にならないように)。
 */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "ファイルを読み込めませんでした。このアプリで書き出したバックアップファイル(JSON)を選んでください。",
    };
  }

  if (!isRecord(data) || data.app !== BACKUP_APP) {
    return { ok: false, error: "このアプリで書き出したバックアップファイルではありません。" };
  }
  if (typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, error: "バックアップファイルのバージョンが正しくありません。" };
  }
  if (data.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: "新しいバージョンのアプリで書き出したファイルです。アプリを更新してから読み込んでください。",
    };
  }
  if (!Array.isArray(data.recipes)) {
    return { ok: false, error: "バックアップファイルにレシピのデータがありません。" };
  }

  const recipes: Recipe[] = [];
  const seenIds = new Set<string>();
  for (const [i, raw] of data.recipes.entries()) {
    const parsed = parseRecipe(raw);
    if ("problem" in parsed) {
      const name = isRecord(raw) && isNonEmptyText(raw.name) ? `「${raw.name}」` : "";
      return {
        ok: false,
        error: `${i + 1}件目のレシピ${name}の「${parsed.problem}」が正しくないため、読み込めません。`,
      };
    }
    if (seenIds.has(parsed.recipe.id)) {
      return {
        ok: false,
        error: `${i + 1}件目のレシピ「${parsed.recipe.name}」のIDが、ファイル内の別のレシピと重複しています。`,
      };
    }
    seenIds.add(parsed.recipe.id);
    recipes.push(parsed.recipe);
  }

  let customCategories: string[] = [];
  if (data.customCategories !== undefined) {
    if (!Array.isArray(data.customCategories) || !data.customCategories.every(isText)) {
      return { ok: false, error: "カテゴリーのデータが正しくないため、読み込めません。" };
    }
    customCategories = data.customCategories.filter(isNonEmptyText);
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version: data.version,
      exportedAt: isText(data.exportedAt) ? data.exportedAt : "",
      recipes,
      customCategories,
    },
  };
}

// --- 取り込み ---

/**
 * 「追加」: いま登録済みのレシピはそのまま残し、ファイルのレシピを加える。
 * 同じ ID のレシピは登録済みとみなして重複させない(同じファイルを2回読み込んでも増えない)。
 */
export function mergeRecipes(
  existing: Recipe[],
  incoming: Recipe[],
): { recipes: Recipe[]; added: number; skipped: number } {
  const existingIds = new Set(existing.map((r) => r.id));
  const toAdd = incoming.filter((r) => !existingIds.has(r.id));
  // 一覧は新しい順に並べる(sort は安定なので、日時が同じものは元の順のまま)
  const recipes = [...existing, ...toAdd].sort((a, b) => b.createdAt - a.createdAt);
  return { recipes, added: toAdd.length, skipped: incoming.length - toAdd.length };
}

/** 重複を除いて順序を保ったまま、カテゴリー名を結合する */
export const mergeCategoryNames = (...lists: string[][]): string[] => [
  ...new Set(lists.flat()),
];
