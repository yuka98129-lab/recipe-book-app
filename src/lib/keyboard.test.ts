import { describe, expect, it } from "vitest";
import { isPlainEnter } from "./keyboard";

const key = (key: string, keyCode: number, isComposing = false) => ({
  key,
  keyCode,
  nativeEvent: { isComposing },
});

describe("isPlainEnter", () => {
  it("通常の Enter は true", () => {
    expect(isPlainEnter(key("Enter", 13))).toBe(true);
  });

  it("日本語入力の変換中の Enter(isComposing)は false(Chrome など)", () => {
    expect(isPlainEnter(key("Enter", 229, true))).toBe(false);
  });

  it("変換確定の直後で isComposing が false でも keyCode 229 なら false(Safari)", () => {
    expect(isPlainEnter(key("Enter", 229, false))).toBe(false);
  });

  it("Enter 以外のキーは false", () => {
    expect(isPlainEnter(key("a", 65))).toBe(false);
    expect(isPlainEnter(key("Tab", 9))).toBe(false);
  });
});
