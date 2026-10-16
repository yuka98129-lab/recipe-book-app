import { describe, expect, it, vi } from "vitest";
import { ReadError } from "./recipe-reader";
import { buildNutritionContent, buildNutritionTool, estimateNutrition } from "./recipe-nutrition";

const input = {
  name: "親子丼",
  groups: [
    { title: "材料", rows: [{ name: "卵", quantity: "3個" }, { name: "ご飯", quantity: "" }] },
    { title: "調味料", rows: [] },
    { title: "トッピング", rows: [{ name: "ねぎ", quantity: "適量" }] },
  ],
  image: null,
};
const row = { name: "卵", grams: 150, isVegetable: false, energyKcal: 228, proteinG: 18.5, fatG: 15.5, carbG: 0.5, calciumMg: 75, ironMg: 2.8, vitaminAUg: 225, vitaminCMg: 0, vitaminDUg: 6.3, note: "" };
const fake = (content: unknown[]) => { const create = vi.fn().mockResolvedValue({ content }); return { client: { messages: { create } } as never, create }; };

describe("buildNutritionTool", () => {
  it("すべての栄養素・重さ・野菜かどうかを必須にする", () => {
    const props = buildNutritionTool().input_schema.properties as Record<string, { items?: { required?: string[] } }>;
    expect(props.items.items?.required).toEqual(expect.arrayContaining(["grams", "isVegetable", "energyKcal", "vitaminDUg"]));
  });
});

describe("buildNutritionContent", () => {
  it("材料の表をデータとして囲み、空の見出しは出さない。分量なしも書く", () => {
    const text = (buildNutritionContent(input).find((b) => b.type === "text" && b.text.includes("<recipe_data>")) as { text: string }).text;
    expect(text).toContain("【材料】\n- 卵: 3個\n- ご飯: (分量の記載なし)");
    expect(text).toContain("【トッピング】");
    expect(text).not.toContain("【調味料】");
  });
  it("写真があれば画像を付ける。JPEG以外は断る", () => {
    expect(buildNutritionContent({ ...input, image: "data:image/jpeg;base64,/9j/AAAA" }).some((b) => b.type === "image")).toBe(true);
    expect(() => buildNutritionContent({ ...input, image: "data:image/png;base64,AAAA" })).toThrow(ReadError);
  });
});

describe("estimateNutrition", () => {
  it("record_nutrition を必ず使わせ、材料ごとの値を整えて返す", async () => {
    const { client, create } = fake([{ type: "tool_use", id: "t", name: "record_nutrition", input: { items: [row, { ...row, name: "" }], assumptions: ["油は考えない"] } }]);
    const r = await estimateNutrition(client, input, "m");
    expect(r.items).toHaveLength(1);
    expect(r.assumptions).toEqual(["油は考えない"]);
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "record_nutrition" });
  });
  it("何も読めなければ ReadError", async () => {
    await expect(estimateNutrition(fake([{ type: "text", text: "x" }]).client, input)).rejects.toThrow(ReadError);
    await expect(estimateNutrition(fake([{ type: "tool_use", id: "t", name: "record_nutrition", input: { items: [] } }]).client, input)).rejects.toThrow(ReadError);
  });
});
