import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe, RecipeInput } from "./types";

// 本物の Supabase には接続せず、同じ形で動く偽物で、同期の流れ(移行・送信・取り込み・再送)を確かめる。

type Row = { id: string; user_id: string; created_at_ms: number; data: Record<string, unknown> };

function makeRecipe(id: string, over: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name: `料理${id}`,
    category: "主菜",
    tags: [],
    ingredients: [{ name: "卵", quantity: "2個" }],
    seasonings: [],
    extraGroups: [],
    steps: ["焼く"],
    createdAt: Number(id.replace(/\D/g, "")) || 0,
    ...over,
  };
}

const rowOf = (r: Recipe): Row => {
  const { id, ...data } = r;
  return { id, user_id: "u1", created_at_ms: r.createdAt, data };
};

function fakeSupabase(initial: Recipe[] = [], opts: { signedIn?: boolean } = {}) {
  const rows = new Map<string, Row>(initial.map((r) => [r.id, rowOf(r)]));
  const state = { failNext: 0, upsertCalls: 0, deleteCalls: 0 };
  const session = opts.signedIn === false ? null : { user: { id: "u1", email: "me@example.com" } };

  const failure = () => {
    if (state.failNext > 0) {
      state.failNext -= 1;
      return { message: "Failed to fetch" };
    }
    return null;
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => {
        const q = {
          order: () => q,
          range: async (from: number, to: number) => {
            const error = failure();
            if (error) return { data: null, error };
            const list = [...rows.values()]
              .sort((a, b) => b.created_at_ms - a.created_at_ms)
              .slice(from, to + 1)
              .map((r) => ({ id: r.id, data: r.data }));
            return { data: list, error: null };
          },
        };
        return q;
      },
      upsert: async (rs: Row[]) => {
        state.upsertCalls += 1;
        const error = failure();
        if (error) return { error };
        for (const r of rs) rows.set(r.id, r);
        return { error: null };
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          state.deleteCalls += 1;
          const error = failure();
          if (error) return { error };
          for (const id of ids) rows.delete(id);
          return { error: null };
        },
      }),
    }),
  };
  return { client, rows, state };
}

const input = (name: string): RecipeInput => ({
  name,
  category: "主菜",
  tags: [],
  ingredients: [{ name: "米", quantity: "1合" }],
  seasonings: [],
  extraGroups: [],
  steps: ["炊く"],
});

async function setup(remote: Recipe[] = [], opts: { signedIn?: boolean } = {}) {
  vi.resetModules();
  localStorage.clear();
  const fake = fakeSupabase(remote, opts);
  vi.doMock("./supabase", () => ({
    isSyncConfigured: () => true,
    getSupabase: () => fake.client,
  }));
  const sync = await import("./sync");
  const store = await import("./recipe-store");
  return { fake, sync, store };
}

const localNames = (store: typeof import("./recipe-store")) =>
  store.getSnapshot().recipes.map((r) => r.name);
const outbox = () => JSON.parse(localStorage.getItem("sync:outbox:v1") ?? "[]");

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("./supabase");
});

describe("初めてログインした端末(移行)", () => {
  it("この端末のレシピがサーバーへ送られ、サーバーのレシピも端末に入る", async () => {
    const { fake, sync, store } = await setup([makeRecipe("1", { name: "サーバーのレシピ" })]);
    localStorage.setItem("recipes:v1", JSON.stringify([makeRecipe("2", { name: "端末のレシピ" })]));

    await sync.syncNow();

    expect([...fake.rows.keys()].sort()).toEqual(["1", "2"]);
    expect(localNames(store).sort()).toEqual(["サーバーのレシピ", "端末のレシピ"]);
    expect(outbox()).toEqual([]);
    expect(sync.getSyncState().status).toBe("idle");
  });

  it("2回目以降は、サーバーで消されたレシピを、端末から送り返さない", async () => {
    const { fake, sync, store } = await setup([makeRecipe("1")]);
    await sync.syncNow(); // 移行(端末にも入る)
    fake.rows.delete("1"); // 別の端末で削除された

    await sync.syncNow();

    expect(fake.rows.size).toBe(0);
    expect(localNames(store)).toEqual([]);
  });
});

describe("変更の送信", () => {
  it("追加・変更・削除が、少し待ってからサーバーに反映される", async () => {
    const { fake, sync, store } = await setup();
    sync.startSync();
    await vi.advanceTimersByTimeAsync(10);
    await sync.syncNow(); // 初回の移行を済ませる

    const added = store.addRecipe(input("カレー"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(fake.rows.get(added.id)?.data.name).toBe("カレー");

    store.updateRecipe(added.id, input("ビーフカレー"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(fake.rows.get(added.id)?.data.name).toBe("ビーフカレー");

    store.deleteRecipe(added.id);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fake.rows.has(added.id)).toBe(false);
    expect(outbox()).toEqual([]);
  });

  it("送れなかった変更は消えずに残り、次の同期で再送される", async () => {
    const { fake, sync, store } = await setup();
    sync.startSync(); // アプリ本体では、起動時に必ず呼ばれる
    await vi.advanceTimersByTimeAsync(10);
    await sync.syncNow();

    const added = store.addRecipe(input("オムライス"));
    fake.state.failNext = 1; // 最初の送信だけ、ネットワークエラーにする
    await sync.syncNow();

    expect(sync.getSyncState().status).toBe("error");
    expect(sync.getSyncState().pendingCount).toBe(1);
    expect(localNames(store)).toEqual(["オムライス"]); // 端末には残っている
    expect(fake.rows.size).toBe(0);

    await sync.syncNow();

    expect(sync.getSyncState().status).toBe("idle");
    expect(fake.rows.get(added.id)?.data.name).toBe("オムライス");
    expect(outbox()).toEqual([]);
  });

  it("送れていない間に、サーバーの古い内容で、端末の変更が上書きされない", async () => {
    const { fake, sync, store } = await setup([makeRecipe("1", { name: "古い名前" })]);
    sync.startSync();
    await vi.advanceTimersByTimeAsync(10);
    await sync.syncNow();

    store.updateRecipe("1", input("新しい名前"));
    fake.state.failNext = 1;
    await sync.syncNow(); // 送信に失敗

    expect(localNames(store)).toEqual(["新しい名前"]);
    expect(outbox()).toHaveLength(1);
  });
});

describe("ログインしていないとき", () => {
  it("変更は端末に保存され、送信待ちとして記録される(ログイン後に送られる)", async () => {
    const { fake, sync, store } = await setup([], { signedIn: false });
    sync.startSync();
    await vi.advanceTimersByTimeAsync(10);

    store.addRecipe(input("味噌汁"));
    await vi.advanceTimersByTimeAsync(1500);

    expect(localNames(store)).toEqual(["味噌汁"]);
    expect(outbox()).toHaveLength(1);
    expect(fake.rows.size).toBe(0);
    expect(sync.getSyncState().status).toBe("signed-out");
  });
});

describe("バックアップの読み込み", () => {
  it("「上書き」で消えたレシピは、サーバーからも消える", async () => {
    const { fake, sync, store } = await setup([makeRecipe("1"), makeRecipe("2")]);
    sync.startSync();
    await vi.advanceTimersByTimeAsync(10);
    await sync.syncNow();

    store.importBackup(
      {
        app: "recipe-book",
        version: 1,
        exportedAt: "",
        recipes: [makeRecipe("2"), makeRecipe("3")],
        customCategories: [],
      },
      "replace",
    );
    await vi.advanceTimersByTimeAsync(1500);

    expect([...fake.rows.keys()].sort()).toEqual(["2", "3"]);
  });
});
