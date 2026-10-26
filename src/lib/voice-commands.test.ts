import { describe, expect, it } from "vitest";
import { formatSpoken } from "./cooking";
import { kanjiToNumber, parseDuration, parseVoiceCommand } from "./voice-commands";

describe("kanjiToNumber", () => {
  it("漢数字を読む", () => {
    expect(kanjiToNumber("五")).toBe(5);
    expect(kanjiToNumber("十")).toBe(10);
    expect(kanjiToNumber("十五")).toBe(15);
    expect(kanjiToNumber("三十")).toBe(30);
    expect(kanjiToNumber("九十九")).toBe(99);
    expect(kanjiToNumber("〇五")).toBe(5);
    expect(kanjiToNumber("")).toBeNull();
    expect(kanjiToNumber("百")).toBeNull();
    expect(kanjiToNumber("五五五")).toBeNull();
  });
});

describe("parseDuration", () => {
  it("分・秒・時間・半", () => {
    expect(parseDuration("5分")).toBe(300);
    expect(parseDuration("タイマー５分")).toBe(300);
    expect(parseDuration("三十秒")).toBe(30);
    expect(parseDuration("1分半")).toBe(90);
    expect(parseDuration("1時間30分")).toBe(5400);
    expect(parseDuration("1時間半")).toBe(5400);
    expect(parseDuration("十分")).toBe(600);
    expect(parseDuration("2分30秒")).toBe(150);
    expect(parseDuration("5ふん")).toBe(300);
  });
  it("時間がなければ null。0や1日をこえるものも null", () => {
    expect(parseDuration("つぎ")).toBeNull();
    expect(parseDuration("0分")).toBeNull();
    expect(parseDuration("30時間")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("parseVoiceCommand", () => {
  it("めくる", () => {
    for (const s of ["つぎ", "次へ", "次の手順", "すすんで", "できた", "ネクスト"]) expect(parseVoiceCommand(s), s).toEqual({ type: "next" });
    for (const s of ["まえ", "前に戻って", "もどる", "ひとつ前"]) expect(parseVoiceCommand(s), s).toEqual({ type: "prev" });
  });
  it("タイマー(時間つき・時間なし)", () => {
    expect(parseVoiceCommand("タイマー5分")).toEqual({ type: "timer", seconds: 300 });
    expect(parseVoiceCommand("5分タイマー")).toEqual({ type: "timer", seconds: 300 });
    expect(parseVoiceCommand("三分はかって")).toEqual({ type: "timer", seconds: 180 });
    expect(parseVoiceCommand("10分セット")).toEqual({ type: "timer", seconds: 600 });
    expect(parseVoiceCommand("タイマー")).toEqual({ type: "timer", seconds: undefined });
    expect(parseVoiceCommand("タイマーお願い")).toEqual({ type: "timer", seconds: undefined });
  });
  it("止める・のこり(タイマーという言葉があっても、止める・のこりが先)", () => {
    expect(parseVoiceCommand("タイマー止めて")).toEqual({ type: "stopTimers" });
    expect(parseVoiceCommand("とめて")).toEqual({ type: "stopTimers" });
    expect(parseVoiceCommand("ストップ")).toEqual({ type: "stopTimers" });
    expect(parseVoiceCommand("あと何分")).toEqual({ type: "remaining" });
    expect(parseVoiceCommand("タイマーあと何分？")).toEqual({ type: "remaining" });
    expect(parseVoiceCommand("残りは")).toEqual({ type: "remaining" });
  });
  it("読み上げ・材料", () => {
    expect(parseVoiceCommand("読んで")).toEqual({ type: "read" });
    expect(parseVoiceCommand("もう一回")).toEqual({ type: "read" });
    expect(parseVoiceCommand("材料")).toEqual({ type: "ingredients" });
  });
  it("関係ない話や、空は、動かさない", () => {
    expect(parseVoiceCommand("")).toBeNull();
    expect(parseVoiceCommand("今日の夜ごはんは何にしようかな")).toBeNull();
    expect(parseVoiceCommand("5分")).toBeNull(); // タイマーと言わない数字だけの言葉は、動かさない
    expect(parseVoiceCommand("もうちょっと塩かな")).toBeNull();
  });
});

describe("formatSpoken", () => {
  it("読み上げる時間", () => {
    expect(formatSpoken(300)).toBe("5分");
    expect(formatSpoken(90)).toBe("1分30秒");
    expect(formatSpoken(30)).toBe("30秒");
    expect(formatSpoken(3700)).toBe("1時間1分40秒");
    expect(formatSpoken(0)).toBe("0秒");
    expect(formatSpoken(0.2)).toBe("1秒");
  });
});
