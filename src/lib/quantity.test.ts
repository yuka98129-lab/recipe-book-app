import { describe, expect, it } from "vitest";
import { formatAmount, hasScalableAmount, scaleQuantity } from "./quantity";

describe("formatAmount", () => {
  it("分数・帯分数・小数", () => {
    expect(formatAmount(0.5, false)).toBe("1/2");
    expect(formatAmount(1.5, false)).toBe("1と1/2");
    expect(formatAmount(2, false)).toBe("2");
    expect(formatAmount(2 / 3, false)).toBe("2/3");
    expect(formatAmount(0.125, false)).toBe("1/8");
    expect(formatAmount(2.2, false)).toBe("2.2");
    expect(formatAmount(1.99, false)).toBe("2");
  });
  it("重さ・かさは、きりのよい数に", () => {
    expect(formatAmount(225, true)).toBe("225");
    expect(formatAmount(227, true)).toBe("225");
    expect(formatAmount(33.3, true)).toBe("33");
    expect(formatAmount(7.5, true)).toBe("7.5");
  });
});

describe("scaleQuantity", () => {
  const x2 = (s: string) => scaleQuantity(s, 2);
  it("2倍", () => {
    expect(x2("3個")).toBe("6個");
    expect(x2("200g")).toBe("400g");
    expect(x2("大さじ1/2")).toBe("大さじ1");
    expect(x2("小さじ1/4")).toBe("小さじ1/2");
    expect(x2("大さじ1と1/2")).toBe("大さじ3");
    expect(x2("1と1/2カップ")).toBe("3カップ");
    expect(x2("1/2本")).toBe("1本");
    expect(x2("1カップ")).toBe("2カップ");
    expect(x2("100ml")).toBe("200ml");
  });
  it("0.5倍・1.5倍", () => {
    expect(scaleQuantity("3個", 0.5)).toBe("1と1/2個");
    expect(scaleQuantity("大さじ1", 0.5)).toBe("大さじ1/2");
    expect(scaleQuantity("小さじ1/2", 1.5)).toBe("小さじ3/4");
    expect(scaleQuantity("150g", 1.5)).toBe("225g");
    expect(scaleQuantity("1/2個", 3)).toBe("1と1/2個");
  });
  it("範囲・かっこの中・半分・全角数字も", () => {
    expect(x2("2〜3個")).toBe("4〜6個");
    expect(x2("1個(約200g)")).toBe("2個(約400g)");
    expect(x2("半分")).toBe("1");
    expect(x2("半個")).toBe("1個");
    expect(x2("３個")).toBe("6個");
    expect(x2("0.5カップ")).toBe("1カップ");
  });
  it("数字のない分量・量ではない数字は、そのまま", () => {
    expect(x2("適量")).toBe("適量");
    expect(x2("少々")).toBe("少々");
    expect(x2("お好みで")).toBe("お好みで");
    expect(x2("")).toBe("");
    expect(x2("3cm")).toBe("3cm");
    expect(x2("5分")).toBe("5分");
    expect(x2("3等分")).toBe("3等分");
    expect(x2("1/2本を3cmに切る")).toBe("1本を3cmに切る");
  });
  it("倍率が1・不正なら、そのまま", () => {
    expect(scaleQuantity("3個", 1)).toBe("3個");
    expect(scaleQuantity("3個", 0)).toBe("3個");
    expect(scaleQuantity("3個", NaN)).toBe("3個");
    expect(scaleQuantity("3個", -2)).toBe("3個");
  });
  it("元に戻せる(2倍して0.5倍)", () => {
    for (const q of ["3個", "大さじ1/2", "200g", "1と1/2カップ"]) expect(scaleQuantity(scaleQuantity(q, 2), 0.5)).toBe(q.replace("大さじ1/2", "大さじ1/2"));
  });
});

describe("hasScalableAmount", () => {
  it("数字の分量があるか", () => {
    expect(hasScalableAmount("3個")).toBe(true);
    expect(hasScalableAmount("大さじ1")).toBe(true);
    expect(hasScalableAmount("適量")).toBe(false);
    expect(hasScalableAmount("3cm")).toBe(false);
  });
});
