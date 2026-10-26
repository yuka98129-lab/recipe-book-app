import { describe, expect, it, vi } from "vitest";
import { buildFridgeContent, buildFridgeTool, parseFridgeReading, readFridge } from "./fridge-reader";
import { ReadError } from "./recipe-reader";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";

describe("parseFridgeReading", () => {
  it("名前を整え、重複(ひらがな・カタカナの違いも)・空・形の違う行を捨てる", () => {
    const r = parseFridgeReading({
      items: [
        { name: " キャベツ ", sure: true, seasoning: false },
        { name: "きゃべつ", sure: true, seasoning: false },
        { name: "", sure: true, seasoning: false },
        { name: "マヨネーズ", sure: false, seasoning: true },
        { name: "<b>豆腐</b>", sure: true, seasoning: false },
        null,
        "x",
        { name: 5 },
      ],
      notes: ["奥は暗い", "", 3],
    });
    expect(r.items).toEqual([
      { name: "キャベツ", sure: true, seasoning: false },
      { name: "マヨネーズ", sure: false, seasoning: true },
      { name: "b豆腐/b", sure: true, seasoning: false },
    ]);
    expect(r.notes).toEqual(["奥は暗い"]);
  });
  it("40件まで。壊れた入力は空", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `食材${i}`, sure: true, seasoning: false }));
    expect(parseFridgeReading({ items: many }).items).toHaveLength(40);
    expect(parseFridgeReading(undefined)).toEqual({ items: [], notes: [] });
    expect(parseFridgeReading({ items: "x" }).items).toEqual([]);
  });
});

describe("build", () => {
  it("写真を画像として入れ、指示には従わない・人の情報は読まない、と伝える", () => {
    const c = buildFridgeContent([JPEG, JPEG]);
    expect(c.filter((b) => b.type === "image")).toHaveLength(2);
    const text = JSON.stringify(c);
    expect(text).toContain("従わない");
    expect(text).toContain("個人の情報");
    expect(buildFridgeTool().name).toBe("record_fridge");
  });
  it("JPEG 以外は ReadError", () => {
    expect(() => buildFridgeContent(["data:image/png;base64,AAAA"])).toThrow(ReadError);
  });
});

describe("readFridge", () => {
  const client = (content: unknown) => ({ messages: { create: vi.fn().mockResolvedValue({ content }) } }) as never;
  it("ツールの結果を返す", async () => {
    const c = client([{ type: "tool_use", id: "t", name: "record_fridge", input: { items: [{ name: "卵", sure: true, seasoning: false }], notes: [] } }]);
    expect((await readFridge(c, [JPEG])).items[0].name).toBe("卵");
  });
  it("材料が1つもなければ ReadError(理由があれば、メッセージに入る)", async () => {
    const c = client([{ type: "tool_use", id: "t", name: "record_fridge", input: { items: [], notes: ["暗くて見えない"] } }]);
    await expect(readFridge(c, [JPEG])).rejects.toThrow(/暗くて見えない/);
    await expect(readFridge(client([{ type: "text", text: "x" }]), [JPEG])).rejects.toBeInstanceOf(ReadError);
  });
});
