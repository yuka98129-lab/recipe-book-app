import { DEFAULT_CATEGORIES } from "./constants";
import type { Recipe, RecipeInput } from "./types";

// localStorage への唯一の窓口。UI は保存形式を知らない。
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

function isRecipe(v: unknown): v is Recipe {
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

function load(): StoreSnapshot {
  const recipes = readArray(RECIPES_KEY).filter(isRecipe);
  const custom = readArray(CATEGORIES_KEY).filter(
    (c): c is string => typeof c === "string",
  );
  return { recipes, categories: mergeCategories(custom) };
}

export class StorageError extends Error {}

function commit(next: StoreSnapshot) {
  const custom = next.categories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(next.recipes));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(custom));
  } catch {
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
  return recipe;
}

export function updateRecipe(id: string, input: RecipeInput) {
  const current = getSnapshot();
  commit({
    recipes: current.recipes.map((r) => (r.id === id ? { ...r, ...input } : r)),
    categories: withCategory(current.categories, input.category),
  });
}

export function deleteRecipe(id: string) {
  const current = getSnapshot();
  commit({
    recipes: current.recipes.filter((r) => r.id !== id),
    categories: current.categories,
  });
}
