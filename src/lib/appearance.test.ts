import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_BOOT_SCRIPT, APPEARANCE_KEY, applyAppearance, DEFAULT_APPEARANCE, parseAppearance, SIZES, THEMES } from "./appearance";

describe("parseAppearance", () => {
  it("正しい値は、そのまま。文字列(JSON)でも読める", () => {
    expect(parseAppearance({ theme: "blue", size: "large" })).toEqual({ theme: "blue", size: "large" });
    expect(parseAppearance('{"theme":"red","size":"xlarge"}')).toEqual({ theme: "red", size: "xlarge" });
  });
  it("壊れた値・知らない値は、初期値に", () => {
    expect(parseAppearance("{bad")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: "green", size: 3 })).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: "red" })).toEqual({ theme: "red", size: "normal" });
  });
});

describe("applyAppearance / ブートスクリプト", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#ff5e57">';
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-size");
    localStorage.clear();
  });
  it("html の属性と、上のバーの色を変える", () => {
    applyAppearance({ theme: "blue", size: "large" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("blue");
    expect(document.documentElement.getAttribute("data-size")).toBe("large");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#2f7be5");
  });
  it("ブートスクリプトは、保存した値を反映する(知らない値・壊れた保存は、初期値)", () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: "red", size: "xlarge" }));
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("red");
    expect(document.documentElement.getAttribute("data-size")).toBe("xlarge");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#e53935");
    localStorage.setItem(APPEARANCE_KEY, "{bad");
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("coral");
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: "x", size: "y" }));
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-size")).toBe("normal");
  });
  it("選択肢の id が、スクリプトにも入っている", () => {
    for (const t of THEMES) expect(APPEARANCE_BOOT_SCRIPT).toContain(t.id);
    for (const s of SIZES) expect(APPEARANCE_BOOT_SCRIPT).toContain(s.id);
    vi.restoreAllMocks();
  });
});
