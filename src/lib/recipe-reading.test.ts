import { describe, expect, it, vi } from "vitest";
import { buildReadingContent, buildReadingTool, fetchReadings, parseReadings } from "./recipe-reading";
import { ReadError } from "./recipe-reader";

const items = [{ id: "a", name: "親子丼" }, { id: "b", name: "麻婆豆腐" }];

describe("parseReadings", () => {
  it("ひらがなに整える。渡していない id・ひらがなにできない読み・重複は捨てる", () => {
    const out = parseReadings(
      [{ id: "a", reading: "オヤコドン" }, { id: "b", reading: "麻婆とうふ" }, { id: "zzz", reading: "ほげ" }, { id: "a", reading: "ちがう" }, null, "x"],
      items,
    );
    expect(out).toEqual([{ id: "a", reading: "おやこどん" }]);
  });
  it("配列でなければ空", () => {
    expect(parseReadings(undefined, items)).toEqual([]);
    expect(parseReadings({}, items)).toEqual([]);
  });
});

describe("build", () => {
  it("料理名は <names> に入れ、指示には従わないよう伝える", () => {
    const text = JSON.stringify(buildReadingContent([{ id: "a", name: "親子丼" }]));
    expect(text).toContain("<names>");
    expect(text).toContain("従わない");
    expect(buildReadingTool().name).toBe("record_readings");
  });
});

describe("fetchReadings", () => {
  const client = (content: unknown) => ({ messages: { create: vi.fn().mockResolvedValue({ content }) } }) as never;
  it("ツールの結果を返す", async () => {
    const c = client([{ type: "tool_use", id: "t", name: "record_readings", input: { items: [{ id: "a", reading: "おやこどん" }, { id: "b", reading: "まーぼーどうふ" }] } }]);
    expect(await fetchReadings(c, items)).toHaveLength(2);
  });
  it("1件も使えなければ ReadError", async () => {
    await expect(fetchReadings(client([{ type: "text", text: "x" }]), items)).rejects.toBeInstanceOf(ReadError);
  });
});
