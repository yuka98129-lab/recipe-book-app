import { describe, expect, it } from "vitest";
import { findTimers, formatClock } from "./cooking";

describe("findTimers", () => {
  it("分・秒・時間を見つける", () => {
    expect(findTimers("弱火で10分煮る")).toEqual([{ label: "10分", seconds: 600 }]);
    expect(findTimers("30秒加熱する")).toEqual([{ label: "30秒", seconds: 30 }]);
    expect(findTimers("2時間ねかせる")).toEqual([{ label: "2時間", seconds: 7200 }]);
    expect(findTimers("１０分蒸らす")).toEqual([{ label: "10分", seconds: 600 }]);
    expect(findTimers("5分間ゆでる")).toEqual([{ label: "5分間", seconds: 300 }]);
  });
  it("1時間30分・1時間半は、1つにまとめる", () => {
    expect(findTimers("1時間30分煮込む")).toEqual([{ label: "1時間30分", seconds: 5400 }]);
    expect(findTimers("1時間半おく")).toEqual([{ label: "1時間半", seconds: 5400 }]);
  });
  it("範囲は、短いほうの時間", () => {
    expect(findTimers("5〜10分焼く")).toEqual([{ label: "5〜10分", seconds: 300 }]);
  });
  it("時間ではない「分」は、除く", () => {
    expect(findTimers("3分の1に切る")).toEqual([]);
    expect(findTimers("2分割にする")).toEqual([]);
    expect(findTimers("半分に切る")).toEqual([]);
    expect(findTimers("3等分にする")).toEqual([]);
    expect(findTimers("")).toEqual([]);
  });
  it("複数あれば順に(同じ表示は1つ。3つまで)", () => {
    expect(findTimers("5分炒めて、10分煮る。さらに5分")).toEqual([
      { label: "5分", seconds: 300 },
      { label: "10分", seconds: 600 },
    ]);
    expect(findTimers("1分 2分 3分 4分")).toHaveLength(3);
  });
  it("0分・24時間より長いものは、除く", () => {
    expect(findTimers("0分")).toEqual([]);
    expect(findTimers("48時間")).toEqual([]);
  });
});

describe("formatClock", () => {
  it("残り時間", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(3700)).toBe("1:01:40");
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(4.2)).toBe("0:05");
  });
});
