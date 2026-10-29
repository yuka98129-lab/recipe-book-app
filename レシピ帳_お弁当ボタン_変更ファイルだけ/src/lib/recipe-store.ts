import { mergeCategoryNames, mergeRecipes, type BackupFile } from "./backup";
import { DEFAULT_CATEGORIES } from "./constants";
import { isCookingMinutes } from "./cooking-time";
import { isPhotoPath } from "./photo-path";
import { isBento } from "./scene";
import { parseStoredNutrition, type NutritionEstimate } from "./nutrition";
import { isServings } from "./servings";
import { cleanReading } from "./reading";
import { diffToOps, type PendingOp } from "./sync-logic";
import type { Ingredient, IngredientGroup, Recipe, RecipeInput } from "./types";

// localStorage への唯一の窓口。UI は保存形式を知らない。
// 同期(sync.ts)は、変更の通知(setChangeHandler)と、サーバーの内容の反映(replaceFromRemote)だけでつながる。
const RECIPES_KEY = "recipes:v1";
const CATEGORIES_KEY = "categories:v1";

export type StoreSnapshot = {
  recipes: Recipe[];
  /** 初期カテゴリー + ユーザーが追加したカテゴリー */
  categories: string[];
};

const EMPTY: StoreSnapshot = { recipes: [], categories: DEFAULT_CATEGORIES };

let cache: StoreSnapshot | null = null;
const listeners = new Set<() => void>();

/** 保存済みデータの形。seasonings と extraGroups は後から追加したため、古いレシピには無い */
type StoredRecipe = Omit<Recipe, "seasonings" | "extraGroups" | "photoPath" | "cookingMinutes" | "servings" | "nutrition" | "reading" | "bento"> & {
  reading?: unknown;
  seasonings?: Ingredient[];
  extraGroups?: unknown;
  photoPath?: unknown;
  bento?: unknown;
  cookingMinutes?: unknown;
  servings?: unknown;
  nutrition?: unknown;
};

function isRecipe(v: unknown): v is StoredRecipe {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.category === "string" &&
    Array.isArray(r.tags) &&
    Array.isArray(r.ingredients) &&
    Array.isArray(r.steps)
  );
}

function readArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const mergeCategories = (custom: string[]) => [
  ...DEFAULT_CATEGORIES,
  ...custom.filter((c) => !DEFAULT_CATEGORIES.includes(c)),
];

function isGroup(v: unknown): v is IngredientGroup {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.name === "string" && Array.isArray(g.items);
}

// 古いレシピ(調味料・追加グループの項目自体がない)も新しい形で扱えるようにする
// 写真のパスは、正しい形のときだけ残す(壊れた値は「写真なし」として扱う)
const normalize = (r: StoredRecipe): Recipe => {
  const { photoPath, cookingMinutes, servings, nutrition, reading, bento, ...rest } = r;
  return {
    ...rest,
    seasonings: Array.isArray(r.seasonings) ? r.seasonings : [],
    extraGroups: Array.isArray(r.extraGroups) ? r.extraGroups.filter(isGroup) : [],
    ...(cleanReading(reading) ? { reading: cleanReading(reading) } : {}),
    ...(isPhotoPath(photoPath) ? { photoPath } : {}),
    ...(isBento(bento) ? { bento } : {}),
    ...(isCookingMinutes(cookingMinutes) ? { cookingMinutes } : {}),
    ...(isServings(servings) ? { servings } : {}),
    ...(parseStoredNutrition(nutrition) ? { nutrition: parseStoredNutrition(nutrition) } : {}),
  };
};

function load(): StoreSnapshot {
  const recipes = readArray(RECIPES_KEY).filter(isRecipe).map(normalize);
  const custom = readArray(CATEGORIES_KEY).filter(
    (c): c is string => typeof c === "string",
  );
  return { recipes, categories: mergeCategories(custom) };
}

export class StorageError extends Error {}

function restoreItem(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function commit(next: StoreSnapshot) {
  const custom = next.categories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
  // 2つの保存の途中で失敗しても、レシピとカテゴリーが食い違わないよう元に戻せるようにしておく
  const before = {
    recipes: localStorage.getItem(RECIPES_KEY),
    categories: localStorage.getItem(CATEGORIES_KEY),
  };
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(next.recipes));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(custom));
  } catch {
    try {
      restoreItem(RECIPES_KEY, before.recipes);
      restoreItem(CATEGORIES_KEY, before.categories);
    } catch {
      // 元に戻せない場合でも、下のエラーで保存に失敗したことは伝わる
    }
    throw new StorageError(
      "保存できませんでした。ブラウザの保存容量またはプライバシー設定を確認してください。",
    );
  }
  cache = next;
  listeners.forEach((l) => l());
}

// --- useSyncExternalStore 用 ---

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // 別タブでの変更を反映する
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECIPES_KEY || e.key === CATEGORIES_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): StoreSnapshot {
  return (cache ??= load());
}

export function getServerSnapshot(): StoreSnapshot {
  return EMPTY;
}

// --- 同期との接点 ---

type ChangeHandler = (ops: PendingOp[]) => void;
let changeHandler: ChangeHandler | null = null;

/** この端末でレシピが変わったときに呼ばれる関数を登録する(同期がオンのとき、サーバーへ送る変更の記録に使う) */
export function setChangeHandler(handler: ChangeHandler | null) {
  changeHandler = handler;
}

const notifyChange = (ops: PendingOp[]) => {
  if (ops.length > 0) changeHandler?.(ops);
};

/**
 * サーバーから受け取った内容で、この端末のレシピを置き換える(変更の通知は出さない)。
 * 保存に失敗したら StorageError を投げ、状態は変わらない。
 */
export function replaceFromRemote(recipes: Recipe[]) {
  const current = getSnapshot();
  commit({
    recipes,
    categories: mergeCategoryNames(
      current.categories,
      recipes.map((r) => r.category),
    ),
  });
}

// --- 操作 ---

function withCategory(categories: string[], category: string) {
  return categories.includes(category) ? categories : [...categories, category];
}

export function addRecipe(input: RecipeInput): Recipe {
  const current = getSnapshot();
  const recipe: Recipe = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  commit({
    recipes: [recipe, ...current.recipes],
    categories: withCategory(current.categories, input.category),
  });
  notifyChange([{ type: "upsert", id: recipe.id }]);
  return recipe;
}

export function updateRecipe(id: string, input: RecipeInput) {
  const current = getSnapshot();
  commit({
    recipes: current.recipes.map((r) => (r.id === id ? { ...r, ...input } : r)),
    categories: withCategory(current.categories, input.category),
  });
  notifyChange([{ type: "upsert", id }]);
}

/** よみがなだけをまとめて保存する(ほかの内容は変えない)。ひらがなにできないものは、無視する */
export function setReadings(readings: Record<string, string>) {
  const current = getSnapshot();
  const ids: string[] = [];
  const recipes = current.recipes.map((r) => {
    const reading = cleanReading(readings[r.id]);
    if (!reading || r.reading === reading) return r;
    ids.push(r.id);
    return { ...r, reading };
  });
  if (ids.length === 0) return;
  commit({ recipes, categories: current.categories });
  notifyChange(ids.map((id) => ({ type: "upsert", id }) as const));
}

/** 栄養素の推定だけを保存する(undefined なら推定を消す)。レシピのほかの内容は変えない */
export function setNutrition(id: string, nutrition: NutritionEstimate | undefined) {
  const current = getSnapshot();
  commit({
    recipes: current.recipes.map((r) => {
      if (r.id !== id) return r;
      const { nutrition: _old, ...rest } = r;
      void _old;
      return nutrition ? { ...rest, nutrition } : rest;
    }),
    categories: current.categories,
  });
  notifyChange([{ type: "upsert", id }]);
}

export function deleteRecipe(id: string) {
  const current = getSnapshot();
  commit({
    recipes: current.recipes.filter((r) => r.id !== id),
    categories: current.categories,
  });
  notifyChange([{ type: "delete", id }]);
}

export type ImportMode = "add" | "replace";
export type ImportResult = { added: number; skipped: number };

/**
 * 検証済みのバックアップを取り込む。保存に失敗したら StorageError を投げ、状態は変わらない。
 * - add: いまのレシピは残し、ファイルのレシピを加える(同じ ID は登録済みとして飛ばす)
 * - replace: いまのレシピをすべて、ファイルの内容に置き換える
 */
export function importBackup(backup: BackupFile, mode: ImportMode): ImportResult {
  const current = getSnapshot();

  if (mode === "replace") {
    commit({
      recipes: backup.recipes,
      categories: mergeCategoryNames(
        DEFAULT_CATEGORIES,
        backup.customCategories,
        backup.recipes.map((r) => r.category),
      ),
    });
    notifyChange(diffToOps(current.recipes, backup.recipes));
    return { added: backup.recipes.length, skipped: 0 };
  }

  const merged = mergeRecipes(current.recipes, backup.recipes);
  commit({
    recipes: merged.recipes,
    categories: mergeCategoryNames(
      current.categories,
      backup.customCategories,
      backup.recipes.map((r) => r.category),
    ),
  });
  notifyChange(diffToOps(current.recipes, merged.recipes));
  return { added: merged.added, skipped: merged.skipped };
}
