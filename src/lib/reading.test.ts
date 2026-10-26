import { describe, expect, it } from "vitest";
import { cleanReading, compareRecipes, groupByGyou, gyouOf, isKanaOnly, needsReading, readingOf, toHiragana } from "./reading";
import type { Recipe } from "./types";

const recipe = (name: string, reading?: string): Recipe => ({
  id: name, name, ...(reading ? { reading } : {}), category: "主菜", tags: [],
  ingredients: [], seasonings: [], extraGroups: [], steps: [], createdAt: 0,
});

describe("toHiragana / isKanaOnly / cleanReading", () => {
  it("カタカナ・半角カナ・全角英数をそろえる", () => {
    expect(toHiragana("カレー")).toBe("かれー");
    expect(toHiragana("ｶﾚｰ ライス")).toBe("かれーらいす");
    expect(toHiragana("ヴ")).toBe("ゔ");
  });
  it("かなだけの名前を見分ける(漢字・英字まじりは違う)", () => {
    expect(isKanaOnly("カレー")).toBe(true);
    expect(isKanaOnly("きんぴら")).toBe(true);
    expect(isKanaOnly("親子丼")).toBe(false);
    expect(isKanaOnly("BLTサンド")).toBe(false);
    expect(isKanaOnly("")).toBe(false);
  });
  it("よみがなを、ひらがなだけに整える。漢字・記号・長すぎるものは捨てる", () => {
    expect(cleanReading("オヤコドン")).toBe("おやこどん");
    expect(cleanReading(" おやこ どん ")).toBe("おやこどん");
    expect(cleanReading("親子どん")).toBe("");
    expect(cleanReading("abc")).toBe("");
    expect(cleanReading("")).toBe("");
    expect(cleanReading(123)).toBe("");
    expect(cleanReading("あ".repeat(61))).toBe("");
  });
});

describe("gyouOf", () => {
  it("行を見分ける(濁点・小さい字も同じ行)", () => {
    const rows = { あ: "あいうえおぁ", か: "かがぐ", さ: "さじず", た: "たでどっ", な: "なぬ", は: "はばぱぷ", ま: "まも", や: "やゃゆ", ら: "らり", わ: "わをん" };
    for (const [head, chars] of Object.entries(rows)) for (const c of chars) expect(gyouOf(c + "あ")).toBe(`${head}行`);
  });
  it("長音で始まるときは、次の字を見る。かなでなければ「その他」", () => {
    expect(gyouOf("ーかれー")).toBe("か行");
    expect(gyouOf("")).toBe("その他");
    expect(gyouOf("abc")).toBe("その他");
  });
});

describe("readingOf / needsReading", () => {
  it("よみがな → かなの名前 → なし の順", () => {
    expect(readingOf(recipe("親子丼", "おやこどん"))).toBe("おやこどん");
    expect(readingOf(recipe("カレー"))).toBe("かれー");
    expect(readingOf(recipe("親子丼"))).toBe("");
    expect(needsReading(recipe("親子丼"))).toBe(true);
    expect(needsReading(recipe("カレー"))).toBe(false);
    expect(needsReading(recipe("親子丼", "おやこどん"))).toBe(false);
  });
});

describe("並べ替え・行ごとのまとめ", () => {
  const list = [
    recipe("サラダ"), recipe("親子丼", "おやこどん"), recipe("青椒肉絲", "ちんじゃおろーす"),
    recipe("カレー"), recipe("きんぴら"), recipe("白滝の炒め物"), recipe("ガパオ"), recipe("あじフライ"),
  ];
  it("あいうえお順に並ぶ。読みがなく漢字まじりのものは、最後", () => {
    expect([...list].sort(compareRecipes).map((r) => r.name)).toEqual([
      "あじフライ", "親子丼", "ガパオ", "カレー", "きんぴら", "サラダ", "青椒肉絲", "白滝の炒め物",
    ]);
  });
  it("あ行・か行…の順にまとめる(空の行は出さない。読みがないものは「その他」)", () => {
    const g = groupByGyou(list);
    expect(g.map((x) => x.gyou)).toEqual(["あ行", "か行", "さ行", "た行", "その他"]);
    expect(g[0].recipes.map((r) => r.name)).toEqual(["あじフライ", "親子丼"]);
    expect(g[1].recipes.map((r) => r.name)).toEqual(["ガパオ", "カレー", "きんぴら"]);
    expect(g[4].recipes.map((r) => r.name)).toEqual(["白滝の炒め物"]);
  });
  it("元の配列は変えない・空なら空", () => {
    const copy = [...list];
    groupByGyou(list);
    expect(list).toEqual(copy);
    expect(groupByGyou([])).toEqual([]);
  });
});
