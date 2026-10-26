import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadStore() {
  vi.resetModules();
  return import("./synonym-store");
}
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("synonym-store", () => {
  it("何もなければ空。壊れた保存は空として扱う(整えて読む)", async () => {
    expect((await loadStore()).getSnapshot()).toEqual([]);
    localStorage.setItem("synonyms:v1", "{bad");
    expect((await loadStore()).getSnapshot()).toEqual([]);
    localStorage.setItem("synonyms:v1", JSON.stringify([["白滝", "しらたき"], ["x"], "y", [1, 2], ["青汁", "あおじる", "青汁"]]));
    expect((await loadStore()).getSnapshot()).toEqual([["白滝", "しらたき"], ["青汁", "あおじる"]]);
  });
  it("足す・消す・再読み込みしても残る。足したものは、索引に反映される", async () => {
    const s = await loadStore();
    expect(s.getIndex().same("青汁", "あおじる")).toBe(false);
    expect(s.addGroup(["青汁", "あおじる"])).toBeNull();
    expect(s.getIndex().same("青汁", "あおじる")).toBe(true);
    expect(s.getIndex()).toBe(s.getIndex());
    expect((await loadStore()).getSnapshot()).toEqual([["青汁", "あおじる"]]);
    s.removeGroup(0);
    expect(s.getSnapshot()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("synonyms:v1")!)).toEqual([]);
  });
  it("2つ未満は、理由を返して、足さない。100組まで", async () => {
    const s = await loadStore();
    expect(s.addGroup(null)).toMatch(/2つ以上/);
    for (let i = 0; i < 100; i++) expect(s.addGroup([`ざいりょう${i}`, `べつ${i}`])).toBeNull();
    expect(s.addGroup(["あ1", "い1"])).toMatch(/100組/);
  });
  it("保存できないときは、例外(SynonymStoreError)。内容は変わらない", async () => {
    const s = await loadStore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => s.addGroup(["青汁", "あおじる"])).toThrow(s.SynonymStoreError);
    expect(s.getSnapshot()).toEqual([]);
  });
  it("変更を購読者に知らせる", async () => {
    const s = await loadStore();
    const l = vi.fn();
    const off = s.subscribe(l);
    s.addGroup(["青汁", "あおじる"]);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    s.removeGroup(0);
    expect(l).toHaveBeenCalledTimes(1);
  });
});
