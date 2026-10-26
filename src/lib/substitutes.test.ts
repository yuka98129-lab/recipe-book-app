import { describe, expect, it } from "vitest";
import { buildSynonymIndex } from "./synonyms";
import { findEntry, substitutesFor, substitutesForMissing, usableSubstitute } from "./substitutes";
import type { Recipe } from "./types";

describe("findEntry", () => {
  it("名前の言い方がちがっても、見つかる", () => {
    expect(findEntry("みりん")).toBeDefined();
    expect(findEntry("本みりん")).toBe(findEntry("みりん"));
    expect(findEntry("ミリン")).toBe(findEntry("みりん"));
    expect(findEntry("料理酒")).toBe(findEntry("酒"));
  });
  it("1文字の言葉は、まったく同じ時だけ(酒粕・ごま油は、別)", () => {
    expect(findEntry("酒粕")).toBeUndefined();
    expect(findEntry("ごま油")).not.toBe(findEntry("油"));
    expect(findEntry("すし酢")).toBeUndefined();
    expect(findEntry("")).toBeUndefined();
    expect(findEntry("ひみつの材料")).toBeUndefined();
  });
});

describe("substitutesFor", () => {
  it("みりん大さじ1 → 料理酒 大さじ1 ＋ 砂糖 小さじ1", () => {
    const [first] = substitutesFor("みりん", "大さじ1");
    expect(first.text).toBe("料理酒 大さじ1 ＋ 砂糖 小さじ1");
    expect(first.label).toBe("料理酒 ＋ 砂糖");
  });
  it("分量に合わせて計算する(大さじ2 → 酒 大さじ2 ＋ 砂糖 小さじ2)", () => {
    expect(substitutesFor("みりん", "大さじ2")[0].text).toBe("料理酒 大さじ2 ＋ 砂糖 小さじ2");
    expect(substitutesFor("みりん", "小さじ1")[0].text).toBe("料理酒 小さじ1 ＋ 砂糖 小さじ1/3");
  });
  it("人数を変えると、代用の分量も変わる", () => {
    expect(substitutesFor("みりん", "大さじ1", 2)[0].text).toBe("料理酒 大さじ2 ＋ 砂糖 小さじ2");
    expect(substitutesFor("みりん", "大さじ1", 0.5)[0].text).toBe("料理酒 大さじ1/2 ＋ 砂糖 小さじ1/2");
  });
  it("きりのよい数で、大さじ・小さじを選ぶ(大さじ1と1/3 より、小さじ4)", () => {
    expect(substitutesFor("みりん", "大さじ4")[0].text).toBe("料理酒 大さじ4 ＋ 砂糖 小さじ4");
    expect(substitutesFor("みりん", "大さじ2", 4)[0].text).toBe("料理酒 大さじ8 ＋ 砂糖 小さじ8");
    expect(substitutesFor("みりん", "大さじ10")[0].text).toBe("料理酒 大さじ10 ＋ 砂糖 小さじ10");
  });
  it("カップ・ml・gは、もとの単位で出す", () => {
    expect(substitutesFor("牛乳", "200ml")[1].text).toBe("生クリーム 100ml ＋ 水 100ml");
    expect(substitutesFor("牛乳", "カップ1")[0].text).toBe("豆乳 カップ1");
    expect(substitutesFor("豚肉", "200g")[0].text).toBe("鶏肉 200g");
    expect(substitutesFor("砂糖", "30g")[0].text).toBe("はちみつ 20g");
  });
  it("個などは、同じ量。数字がなければ、適量", () => {
    expect(substitutesFor("キャベツ", "1/2個")[0].text).toBe("白菜 同じ量");
    expect(substitutesFor("片栗粉", "2個")[1].text).toBe("小麦粉 2倍の量");
    expect(substitutesFor("みりん", "適量")[0].text).toBe("料理酒 適量 ＋ 砂糖 適量");
    expect(substitutesFor("みりん", "")[0].text).toBe("料理酒 適量 ＋ 砂糖 適量");
  });
  it("表にない材料は、空", () => {
    expect(substitutesFor("ひみつの材料", "1個")).toEqual([]);
  });
  it("おかしな倍率でも、こわれない", () => {
    expect(substitutesFor("みりん", "大さじ1", NaN)[0].text).toBe("料理酒 大さじ1 ＋ 砂糖 小さじ1");
    expect(substitutesFor("みりん", "大さじ1", -2)[0].text).toBe("料理酒 大さじ1 ＋ 砂糖 小さじ1");
  });
});

describe("usableSubstitute", () => {
  it("手持ちで、ぜんぶそろう代用だけ選ぶ(水は、数えない)", () => {
    expect(usableSubstitute("みりん", "大さじ1", ["料理酒", "砂糖"])?.label).toBe("料理酒 ＋ 砂糖");
    expect(usableSubstitute("みりん", "大さじ1", ["酒"])).toBeNull();
    expect(usableSubstitute("みりん", "大さじ1", ["砂糖"])?.label).toBe("水 ＋ 砂糖");
  });
  it("手持ちを、言い換えで数える(日本酒 → 料理酒)", () => {
    const syn = buildSynonymIndex([["料理酒", "日本酒"]]);
    expect(usableSubstitute("みりん", "大さじ1", ["日本酒", "砂糖"], syn)?.label).toBe("料理酒 ＋ 砂糖");
  });
  it("白菜しかない時、キャベツの代用になる", () => {
    expect(usableSubstitute("キャベツ", "1/4個", ["白菜"])?.text).toBe("白菜 同じ量");
    expect(usableSubstitute("キャベツ", "1/4個", ["にんじん"])).toBeNull();
  });
  it("代わりの材料が、もとと同じものなら、代用にしない", () => {
    const syn = buildSynonymIndex([["玉ねぎ", "長ねぎ"]]);
    expect(usableSubstitute("玉ねぎ", "1個", ["長ねぎ"], syn)).toBeNull();
  });
});

describe("substitutesForMissing", () => {
  const recipe = {
    id: "r1",
    name: "肉じゃが",
    ingredients: [{ name: "キャベツ", quantity: "1/4個" }],
    seasonings: [{ name: "みりん", quantity: "大さじ2" }],
    extraGroups: [],
  } as unknown as Recipe;
  it("足りない材料のうち、手持ちで代用できるものだけ返す", () => {
    const r = substitutesForMissing(recipe, ["キャベツ", "みりん"], ["白菜", "料理酒", "砂糖"]);
    expect(r.map((x) => `${x.name}:${x.sub.text}`)).toEqual(["キャベツ:白菜 同じ量", "みりん:料理酒 大さじ2 ＋ 砂糖 小さじ2"]);
    expect(substitutesForMissing(recipe, ["みりん"], ["牛乳"])).toEqual([]);
  });
});
