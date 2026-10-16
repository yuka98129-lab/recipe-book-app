import { parsePlanEntry, sortEntries, type PlanEntry } from "./plan";
import type { PendingOp } from "./sync-logic";

// 献立のサーバー同期の計算部分(通信なし)。レシピの同期(sync-logic.ts)と同じ考え方。

export type PlanRow = { id: string; plan_date: unknown; data: unknown };

/** サーバーの行を献立に戻す。形が壊れている行は null */
export function planFromRow(row: PlanRow): PlanEntry | null {
  const d = typeof row.data === "object" && row.data !== null ? (row.data as Record<string, unknown>) : {};
  return parsePlanEntry({ id: row.id, date: row.plan_date, recipeId: d.recipeId, servings: d.servings });
}

export function planToRow(e: PlanEntry) {
  return { id: e.id, plan_date: e.date, data: { recipeId: e.recipeId, servings: e.servings } };
}

/**
 * サーバーの献立を、この端末に反映した結果を計算する。
 * - サーバーが基本(別の端末での追加・変更・削除が反映される)
 * - まだ送れていない自分の変更は優先して残す(追加・変更は端末の内容を使い、削除はサーバーにあっても表示しない)
 */
export function mergePlanRemote(local: PlanEntry[], remote: PlanEntry[], pending: PendingOp[]): PlanEntry[] {
  const upserts = new Set(pending.filter((o) => o.type === "upsert").map((o) => o.id));
  const deletes = new Set(pending.filter((o) => o.type === "delete").map((o) => o.id));
  const localById = new Map(local.map((e) => [e.id, e]));
  const result = new Map<string, PlanEntry>();
  for (const e of remote) {
    if (deletes.has(e.id)) continue;
    result.set(e.id, upserts.has(e.id) ? (localById.get(e.id) ?? e) : e);
  }
  for (const id of upserts) {
    const e = localById.get(id);
    if (e && !result.has(id)) result.set(id, e);
  }
  return sortEntries([...result.values()]);
}

/** サーバーに「表がまだ無い」エラーか(SQL を実行する前) */
export function isMissingTableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  return e.code === "42P01" || e.code === "PGRST205" || (typeof e.message === "string" && /meal_plan/.test(e.message) && /(does not exist|schema cache)/i.test(e.message));
}
