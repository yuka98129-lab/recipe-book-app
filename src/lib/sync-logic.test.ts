import { describe, expect, it } from "vitest";
import {
  addPendingOps,
  diffToOps,
  fromRow,
  mergeRemote,
  migrationOps,
  toRow,
  type PendingOp,
} from "./sync-logic";
import type { Recipe } from "./types";

const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({
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
});

const ids = (rs: Recipe[]) => rs.map((r) => r.id);

describe("addPendingOps", () => {
  it("同じレシピへの変更は、最後の1件だけ残す", () => {
    const current: PendingOp[] = [{ type: "upsert", id: "r1" }];
    const next = addPendingOps(current, [{ type: "delete", id: "r1" }]);
    expect(next).toEqual([{ type: "delete", id: "r1" }]);
  });

  it("別のレシピの変更は、そのまま並ぶ", () => {
    const next = addPendingOps([{ type: "upsert", id: "r1" }], [{ type: "upsert", id: "r2" }]);
    expect(next).toEqual([
      { type: "upsert", id: "r1" },
      { type: "upsert", id: "r2" },
    ]);
  });

  it("追加する側に同じIDが複数あっても、最後の1件だけ残す", () => {
    const next = addPendingOps(
      [],
      [
        { type: "upsert", id: "r1" },
        { type: "delete", id: "r1" },
      ],
    );
    expect(next).toEqual([{ type: "delete", id: "r1" }]);
  });
});

describe("mergeRemote", () => {
  it("送信待ちがなければ、サーバーの内容そのものになる(別の端末の追加・削除が届く)", () => {
    const local = [recipe("2"), recipe("1")];
    const remote = [recipe("3"), recipe("1")];
    expect(ids(mergeRemote(local, remote, []))).toEqual(["3", "1"]);
  });

  it("送信待ちの変更は、サーバーの内容より優先する", () => {
    const edited = recipe("1", { name: "手元で直した名前" });
    const remote = [recipe("1", { name: "古い名前" })];
    const merged = mergeRemote([edited], remote, [{ type: "upsert", id: "1" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("手元で直した名前");
  });

  it("まだサーバーに無い、送信待ちの新しいレシピは残る", () => {
    const merged = mergeRemote([recipe("5")], [recipe("1")], [{ type: "upsert", id: "5" }]);
    expect(ids(merged)).toEqual(["5", "1"]);
  });

  it("送信待ちの削除は、サーバーにあっても表示しない", () => {
    const merged = mergeRemote([], [recipe("1"), recipe("2")], [{ type: "delete", id: "1" }]);
    expect(ids(merged)).toEqual(["2"]);
  });

  it("送信待ちなのに端末に無いレシピは、無視する(消えたレシピを作り出さない)", () => {
    const merged = mergeRemote([], [], [{ type: "upsert", id: "9" }]);
    expect(merged).toEqual([]);
  });

  it("新しい順に並べる", () => {
    const merged = mergeRemote([], [recipe("1"), recipe("3"), recipe("2")], []);
    expect(ids(merged)).toEqual(["3", "2", "1"]);
  });
});

describe("migrationOps", () => {
  it("サーバーに無い端末のレシピだけを「追加」として送る", () => {
    const ops = migrationOps([recipe("1"), recipe("2")], [recipe("1")]);
    expect(ops).toEqual([{ type: "upsert", id: "2" }]);
  });

  it("サーバーにだけあるレシピは、何もしない(消さない)", () => {
    expect(migrationOps([], [recipe("1")])).toEqual([]);
  });
});

describe("diffToOps", () => {
  it("消えたものは削除、増えたものと変わったものは追加・変更になる", () => {
    const before = [recipe("1"), recipe("2"), recipe("3")];
    const after = [recipe("1"), recipe("2", { name: "変更後" }), recipe("4")];
    expect(diffToOps(before, after)).toEqual([
      { type: "delete", id: "3" },
      { type: "upsert", id: "2" },
      { type: "upsert", id: "4" },
    ]);
  });

  it("変わっていなければ、何も出さない", () => {
    expect(diffToOps([recipe("1")], [recipe("1")])).toEqual([]);
  });
});

describe("toRow / fromRow", () => {
  it("レシピを行にして、元に戻せる", () => {
    const r = recipe("7", {
      tags: ["時短"],
      seasonings: [{ name: "塩", quantity: "少々" }],
      extraGroups: [{ name: "トッピング", items: [{ name: "ねぎ", quantity: "適量" }] }],
    });
    const row = toRow(r);
    expect(row.id).toBe("7");
    expect(row.created_at_ms).toBe(7);
    expect(fromRow({ id: row.id, data: row.data })).toEqual(r);
  });

  it("古い形(調味料・追加グループなし)の行も読める", () => {
    const r = fromRow({
      id: "1",
      data: { name: "A", category: "主菜", tags: [], ingredients: [], steps: [], createdAt: 5 },
    });
    expect(r?.seasonings).toEqual([]);
    expect(r?.extraGroups).toEqual([]);
  });

  it("形が壊れている行は null にする", () => {
    expect(fromRow({ id: "1", data: { name: 1 } })).toBeNull();
    expect(fromRow({ id: "1", data: null })).toBeNull();
    expect(fromRow({ id: 1 as unknown as string, data: {} })).toBeNull();
  });
});
