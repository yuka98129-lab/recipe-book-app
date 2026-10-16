import { parsePlanEntry, sortEntries, type PlanEntry } from "./plan";
import { isServings } from "./servings";
import type { PendingOp } from "./sync-logic";

// 献立の保存(localStorage)。レシピと同じく、まず端末に保存し、ログイン中はサーバーにも送る(plan-sync.ts)。

const KEY = "plan:v1";

export type PlanSnapshot = { entries: PlanEntry[] };
const EMPTY: PlanSnapshot = { entries: [] };

let cache: PlanSnapshot | null = null;
const listeners = new Set<() => void>();

function load(): PlanSnapshot {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = parsed.map(parsePlanEntry).filter((e): e is PlanEntry => e !== null);
    return { entries: sortEntries(entries) };
  } catch {
    return EMPTY;
  }
}

export class PlanStorageError extends Error {}

function commit(entries: PlanEntry[]) {
  const next = { entries: sortEntries(entries) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next.entries));
  } catch {
    throw new PlanStorageError("保存できませんでした。ブラウザの保存容量またはプライバシー設定を確認してください。");
  }
  cache = next;
  listeners.forEach((l) => l());
}

export function subscribePlan(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
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

export const getPlanSnapshot = (): PlanSnapshot => (cache ??= load());
export const getServerPlanSnapshot = (): PlanSnapshot => EMPTY;

// --- 同期との接点 ---

let changeHandler: ((ops: PendingOp[]) => void) | null = null;
export function setPlanChangeHandler(h: ((ops: PendingOp[]) => void) | null) {
  changeHandler = h;
}
const notify = (ops: PendingOp[]) => changeHandler?.(ops);

/** サーバーから受け取った内容で置き換える(変更の通知は出さない) */
export function replacePlanFromRemote(entries: PlanEntry[]) {
  commit(entries);
}

// --- 操作 ---

export function addPlanEntry(input: { date: string; recipeId: string; servings: number | null }): PlanEntry {
  const entry: PlanEntry = {
    id: crypto.randomUUID(),
    date: input.date,
    recipeId: input.recipeId,
    servings: isServings(input.servings) ? input.servings : null,
  };
  commit([...getPlanSnapshot().entries, entry]);
  notify([{ type: "upsert", id: entry.id }]);
  return entry;
}

export function setPlanServings(id: string, servings: number | null) {
  const value = isServings(servings) ? servings : null;
  commit(getPlanSnapshot().entries.map((e) => (e.id === id ? { ...e, servings: value } : e)));
  notify([{ type: "upsert", id }]);
}

export function removePlanEntry(id: string) {
  commit(getPlanSnapshot().entries.filter((e) => e.id !== id));
  notify([{ type: "delete", id }]);
}
