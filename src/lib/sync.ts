import type { SupabaseClient } from "@supabase/supabase-js";
import { getSnapshot, replaceFromRemote, setChangeHandler } from "./recipe-store";
import { getSupabase, isSyncConfigured } from "./supabase";
import {
  addPendingOps,
  fromRow,
  mergeRemote,
  migrationOps,
  toRow,
  type PendingOp,
} from "./sync-logic";
import type { Recipe } from "./types";

// 端末とサーバー(Supabase)のレシピをそろえる。
// - 画面は、これまで通り localStorage のデータを読み書きする(recipe-store.ts)。
// - 変更は「送信待ち(outbox)」に記録し、ログイン中にサーバーへ送る。送れなかった分は消えずに残り、次の同期で再送する。
// - 同期のたびに、サーバーの内容を端末へ反映する。別の端末での追加・変更・削除がここで届く。
// - 設定(環境変数)がなければ何もせず、アプリはこれまで通りブラウザ内だけで動く。

const OUTBOX_KEY = "sync:outbox:v1";
const MIGRATED_KEY = "sync:migrated:v1";
const PAGE_SIZE = 1000;
const FLUSH_DELAY_MS = 1000;
const MIN_FOCUS_SYNC_INTERVAL_MS = 15_000;

export type SyncStatus =
  | "loading" // 起動中(ログインしているか確認している)
  | "disabled" // 同期の設定がない
  | "signed-out"
  | "idle" // 同期済み
  | "syncing"
  | "error";

export type SyncState = {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  /** サーバーにまだ送れていない変更の数 */
  pendingCount: number;
  message: string | null;
};

const INITIAL: SyncState = {
  status: "loading",
  email: null,
  lastSyncedAt: null,
  pendingCount: 0,
  message: null,
};

let state: SyncState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const getSyncState = () => state;
export const getServerSyncState = () => INITIAL;

// --- 送信待ちの記録(localStorage) ---

function readOutbox(): PendingOp[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PendingOp =>
        typeof o === "object" &&
        o !== null &&
        (o.type === "upsert" || o.type === "delete") &&
        typeof o.id === "string",
    );
  } catch {
    return [];
  }
}

function writeOutbox(ops: PendingOp[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  } catch {
    // 保存できなくても、画面の操作は止めない(次の同期で、サーバーとの差分から追いつく)
  }
  setState({ pendingCount: ops.length });
}

function readMigrated(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MIGRATED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markMigrated(userId: string) {
  try {
    localStorage.setItem(MIGRATED_KEY, JSON.stringify([...new Set([...readMigrated(), userId])]));
  } catch {
    // 記録できなければ、次回もう一度「サーバーに無いレシピを送る」確認をするだけで、害はない
  }
}

// --- サーバーとのやりとり ---

function describeError(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/failed to fetch|network|load failed/i.test(text) || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return "ネットワークにつながっていないため、同期できませんでした。つながったら自動でやり直します。";
  }
  return "同期できませんでした。時間をおいて「今すぐ同期」を押してください。";
}

async function pullAll(sb: SupabaseClient): Promise<Recipe[]> {
  const recipes: Recipe[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from("recipes")
      .select("id,data")
      .order("created_at_ms", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = fromRow(row);
      if (r) recipes.push(r);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return recipes;
}

/** 送信待ちの変更をサーバーへ送る。送れた分だけ、送信待ちから外す */
async function flush(sb: SupabaseClient, userId: string): Promise<void> {
  const ops = readOutbox();
  if (ops.length === 0) return;

  const local = new Map(getSnapshot().recipes.map((r) => [r.id, r]));
  const upserts = ops.filter((o) => o.type === "upsert");
  const deletes = ops.filter((o) => o.type === "delete");

  const now = new Date().toISOString();
  const rows = upserts
    .map((o) => local.get(o.id))
    .filter((r): r is Recipe => r !== undefined)
    .map((r) => ({ ...toRow(r), user_id: userId, updated_at: now }));

  if (rows.length > 0) {
    const { error } = await sb.from("recipes").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  if (deletes.length > 0) {
    const { error } = await sb
      .from("recipes")
      .delete()
      .in(
        "id",
        deletes.map((o) => o.id),
      );
    if (error) throw error;
  }

  // 送っている間に新しく増えた変更は残し、送れた変更だけ外す
  const sent = new Set(ops.map((o) => `${o.type}:${o.id}`));
  writeOutbox(readOutbox().filter((o) => !sent.has(`${o.type}:${o.id}`)));
}

let running = false;
let runAgain = false;
let lastSyncStartedAt = 0;

/** 送れていない変更を送り、サーバーの内容をこの端末に反映する */
export async function syncNow(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (running) {
    runAgain = true;
    return;
  }
  running = true;
  lastSyncStartedAt = Date.now();
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      setState({ status: "signed-out", email: null, message: null });
      return;
    }
    setState({ status: "syncing", email: user.email ?? null, message: null });

    await flush(sb, user.id);
    let remote = await pullAll(sb);

    // この端末で初めてログインしたとき: サーバーに無いレシピ(いままで端末に保存していたもの)を送る
    if (!readMigrated().includes(user.id)) {
      const ops = migrationOps(getSnapshot().recipes, remote);
      if (ops.length > 0) {
        writeOutbox(addPendingOps(readOutbox(), ops));
        await flush(sb, user.id);
        remote = await pullAll(sb);
      }
      markMigrated(user.id);
    }

    const local = getSnapshot().recipes;
    const merged = mergeRemote(local, remote, readOutbox());
    if (JSON.stringify(merged) !== JSON.stringify(local)) replaceFromRemote(merged);

    setState({ status: "idle", lastSyncedAt: Date.now(), message: null });
  } catch (err) {
    console.error("sync failed", err);
    setState({ status: "error", message: describeError(err) });
  } finally {
    running = false;
    if (runAgain) {
      runAgain = false;
      void syncNow();
    }
  }
}

// --- この端末での変更を記録する ---

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function handleLocalChange(ops: PendingOp[]) {
  // ログインしていないときも記録する(あとでログインしたときに、この変更が失われないように)
  writeOutbox(addPendingOps(readOutbox(), ops));
  if (state.status === "disabled") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void syncNow();
  }, FLUSH_DELAY_MS);
}

// --- ログイン・ログアウト ---

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: "同期の設定がされていません。" };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return {
      error: /invalid login credentials/i.test(error.message)
        ? "メールアドレスまたはパスワードが違います。"
        : "ログインできませんでした。時間をおいてもう一度試してください。",
    };
  }
  // 続きは onAuthStateChange(SIGNED_IN)で同期が始まる
  return { error: null };
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  setState({ status: "signed-out", email: null, message: null });
}

// --- 起動 ---

let started = false;

/** アプリ起動時に1回だけ呼ぶ。ログイン状態の確認、変更の監視、画面に戻ったときの同期を始める */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (!isSyncConfigured()) {
    setState({ status: "disabled" });
    return;
  }
  const sb = getSupabase();
  if (!sb) {
    setState({ status: "disabled" });
    return;
  }

  setChangeHandler(handleLocalChange);
  setState({ pendingCount: readOutbox().length });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      setState({ status: "signed-out", email: null, message: null });
      return;
    }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      setState({ email: session.user.email ?? null });
      // onAuthStateChange の中で、Supabase を直接呼ぶと止まることがあるため、次のタイミングで実行する
      setTimeout(() => void syncNow(), 0);
    }
  });

  const syncIfStale = () => {
    if (state.status === "signed-out" || state.status === "disabled") return;
    if (Date.now() - lastSyncStartedAt < MIN_FOCUS_SYNC_INTERVAL_MS) return;
    void syncNow();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncIfStale();
  });
  window.addEventListener("online", () => void syncNow());
}
