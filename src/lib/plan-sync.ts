import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError, mergePlanRemote, planFromRow, planToRow } from "./plan-logic";
import { getPlanSnapshot, replacePlanFromRemote } from "./plan-store";
import type { PlanEntry } from "./plan";
import { addPendingOps, type PendingOp } from "./sync-logic";

// 献立をサーバー(Supabase の meal_plan 表)とそろえる。レシピの同期(sync.ts)の中から呼ばれる。
// 表がまだ無い(SQL を実行していない)ときは、献立は端末の中だけで使えて、その旨を画面に出す。

const OUTBOX_KEY = "plan:outbox:v1";
const PAGE_SIZE = 1000;

function readOutbox(): PendingOp[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PendingOp => typeof o === "object" && o !== null && (o.type === "upsert" || o.type === "delete") && typeof o.id === "string",
    );
  } catch {
    return [];
  }
}

function writeOutbox(ops: PendingOp[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  } catch {
    // 保存できなくても、画面の操作は止めない
  }
}

/** この端末での変更を、送信待ちに記録する(ログインしていないときも) */
export function recordPlanOps(ops: PendingOp[]) {
  writeOutbox(addPendingOps(readOutbox(), ops));
}

async function pullAll(sb: SupabaseClient): Promise<PlanEntry[]> {
  const entries: PlanEntry[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from("meal_plan")
      .select("id,plan_date,data")
      .order("plan_date")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const e = planFromRow(row);
      if (e) entries.push(e);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return entries;
}

async function flush(sb: SupabaseClient, userId: string) {
  const ops = readOutbox();
  if (ops.length === 0) return;
  const local = new Map(getPlanSnapshot().entries.map((e) => [e.id, e]));
  const now = new Date().toISOString();
  const rows = ops
    .filter((o) => o.type === "upsert")
    .map((o) => local.get(o.id))
    .filter((e): e is PlanEntry => e !== undefined)
    .map((e) => ({ ...planToRow(e), user_id: userId, updated_at: now }));
  if (rows.length > 0) {
    const { error } = await sb.from("meal_plan").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  const deletes = ops.filter((o) => o.type === "delete").map((o) => o.id);
  if (deletes.length > 0) {
    const { error } = await sb.from("meal_plan").delete().in("id", deletes);
    if (error) throw error;
  }
  const sent = new Set(ops.map((o) => `${o.type}:${o.id}`));
  writeOutbox(readOutbox().filter((o) => !sent.has(`${o.type}:${o.id}`)));
}

/**
 * 献立の同期。成功なら null、失敗なら画面に出す短い説明を返す(レシピの同期は止めない)。
 */
export async function syncPlan(sb: SupabaseClient, userId: string): Promise<string | null> {
  try {
    await flush(sb, userId);
    const remote = await pullAll(sb);
    const local = getPlanSnapshot().entries;
    const merged = mergePlanRemote(local, remote, readOutbox());
    if (JSON.stringify(merged) !== JSON.stringify(local)) replacePlanFromRemote(merged);
    return null;
  } catch (err) {
    if (isMissingTableError(err)) {
      return "献立を他の端末と同期するには、Supabase で「献立用のSQL」を1回実行してください(それまでは、この端末の中だけに保存されます)。";
    }
    console.error("plan sync failed", err);
    return "献立を同期できませんでした。時間をおいて「今すぐ同期」を押してください。";
  }
}
