import { isCookingMinutes } from "./cooking-time";
import { isPhotoPath } from "./photo-path";
import { isBento } from "./scene";
import { parseStoredNutrition } from "./nutrition";
import { isServings } from "./servings";
import { cleanReading } from "./reading";
import type { Recipe } from "./types";

/**
 * 端末で行った変更のうち、まだサーバー(Supabase)に送れていないもの。
 * 同じレシピへの変更は、最後の1件だけ残す。
 */
export type PendingOp = { type: "upsert"; id: string } | { type: "delete"; id: string };

/** 同じIDの変更は最後の1件にまとめる(順序は、最後に変更した順) */
export function addPendingOps(current: PendingOp[], added: PendingOp[]): PendingOp[] {
  const ids = new Set(added.map((o) => o.id));
  return [...current.filter((o) => !ids.has(o.id)), ...dedupeLast(added)];
}

function dedupeLast(ops: PendingOp[]): PendingOp[] {
  const last = new Map<string, PendingOp>();
  for (const op of ops) {
    last.delete(op.id);
    last.set(op.id, op);
  }
  return [...last.values()];
}

const byNewest = (a: Recipe, b: Recipe) => b.createdAt - a.createdAt;

/**
 * サーバーの内容を、この端末に反映した結果を計算する。
 * - サーバーのレシピが基本(別の端末での追加・変更・削除がここで反映される)
 * - まだ送れていない自分の変更は、サーバーの内容より優先して残す(送る前に消えないように)
 *   - 送れていない「追加・変更」→ この端末のレシピをそのまま使う
 *   - 送れていない「削除」→ サーバーにあっても表示しない
 */
export function mergeRemote(local: Recipe[], remote: Recipe[], pending: PendingOp[]): Recipe[] {
  const upserts = new Set(pending.filter((o) => o.type === "upsert").map((o) => o.id));
  const deletes = new Set(pending.filter((o) => o.type === "delete").map((o) => o.id));
  const localById = new Map(local.map((r) => [r.id, r]));

  const result = new Map<string, Recipe>();
  for (const r of remote) {
    if (deletes.has(r.id)) continue;
    result.set(r.id, upserts.has(r.id) ? (localById.get(r.id) ?? r) : r);
  }
  // サーバーにまだ無い、送信待ちの新しいレシピ
  for (const id of upserts) {
    const r = localById.get(id);
    if (r && !result.has(id)) result.set(id, r);
  }
  return [...result.values()].sort(byNewest);
}

/**
 * この端末で初めてログインしたときの移行。
 * この端末のレシピのうち、サーバーにまだ無いものを「追加」として送る(サーバーのレシピは消さない)。
 */
export function migrationOps(local: Recipe[], remote: Recipe[]): PendingOp[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  return local.filter((r) => !remoteIds.has(r.id)).map((r) => ({ type: "upsert", id: r.id }));
}

/** 「バックアップ読み込み」などで、変更前後のレシピ一覧から、送るべき変更を求める */
export function diffToOps(before: Recipe[], after: Recipe[]): PendingOp[] {
  const beforeById = new Map(before.map((r) => [r.id, r]));
  const afterIds = new Set(after.map((r) => r.id));
  const ops: PendingOp[] = [];
  for (const r of before) {
    if (!afterIds.has(r.id)) ops.push({ type: "delete", id: r.id });
  }
  for (const r of after) {
    const old = beforeById.get(r.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(r)) ops.push({ type: "upsert", id: r.id });
  }
  return ops;
}

// --- サーバーの行 <-> レシピ ---

export type RecipeRow = { id: string; data: unknown };

/** サーバーに保存する形。id と createdAt は列にも持ち、レシピの中身は data にまとめて入れる */
export function toRow(r: Recipe): { id: string; created_at_ms: number; data: Omit<Recipe, "id"> } {
  const { id, ...data } = r;
  return { id, created_at_ms: r.createdAt, data };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** サーバーの行をレシピに戻す。形が壊れている行は null(他の行の読み込みは続ける) */
export function fromRow(row: RecipeRow): Recipe | null {
  if (typeof row.id !== "string" || !isRecord(row.data)) return null;
  const d = row.data;
  if (
    typeof d.name !== "string" ||
    typeof d.category !== "string" ||
    !Array.isArray(d.tags) ||
    !Array.isArray(d.ingredients) ||
    !Array.isArray(d.steps)
  ) {
    return null;
  }
  return {
    id: row.id,
    name: d.name,
    category: d.category,
    tags: d.tags as string[],
    ingredients: d.ingredients as Recipe["ingredients"],
    seasonings: Array.isArray(d.seasonings) ? (d.seasonings as Recipe["seasonings"]) : [],
    extraGroups: Array.isArray(d.extraGroups) ? (d.extraGroups as Recipe["extraGroups"]) : [],
    steps: d.steps as string[],
    ...(cleanReading(d.reading) ? { reading: cleanReading(d.reading) } : {}),
    ...(isPhotoPath(d.photoPath) ? { photoPath: d.photoPath } : {}),
    ...(isBento(d.bento) ? { bento: d.bento } : {}),
    ...(isCookingMinutes(d.cookingMinutes) ? { cookingMinutes: d.cookingMinutes } : {}),
    ...(isServings(d.servings) ? { servings: d.servings } : {}),
    ...(parseStoredNutrition(d.nutrition) ? { nutrition: parseStoredNutrition(d.nutrition) } : {}),
    createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
  };
}
