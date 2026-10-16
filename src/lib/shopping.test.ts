import { describe, expect, it } from "vitest";
import { buildShoppingList, classify, describeItem, nameKey, parseQuantity, shoppingToText } from "./shopping";
import type { PlanEntry } from "./plan";
import type { Recipe } from "./types";

const recipe = (id: string, name: string, over: Partial<Recipe> = {}): Recipe => ({
  id, name, category: "主菜", tags: [], ingredients: [], seasonings: [], extraGroups: [], steps: ["煮る"], createdAt: 1, ...over,
});
const entry = (id: string, date: string, recipeId: string, servings: number | null = null): PlanEntry => ({ id, date, recipeId, servings });

describe("parseQuantity", () => {
  it("数と単位を読む", () => {
    expect(parseQuantity("3個")).toEqual({ kind: "amount", value: 3, unit: "個" });
    expect(parseQuantity("200g")).toEqual({ kind: "amount", value: 200, unit: "g" });
    expect(parseQuantity("２００ｇ")).toEqual({ kind: "amount", value: 200, unit: "g" });
    expect(parseQuantity("大さじ2")).toEqual({ kind: "amount", value: 2, unit: "大さじ" });
    expect(parseQuantity("小さじ1/2")).toEqual({ kind: "amount", value: 0.5, unit: "小さじ" });
    expect(parseQuantity("1/2個")).toEqual({ kind: "amount", value: 0.5, unit: "個" });
    expect(parseQuantity("1と1/2カップ")).toEqual({ kind: "amount", value: 1.5, unit: "カップ" });
    expect(parseQuantity("1.5本")).toEqual({ kind: "amount", value: 1.5, unit: "本" });
    expect(parseQuantity("2")).toEqual({ kind: "amount", value: 2, unit: "" });
  });
  it("単位をそろえる(グラム→g、kg→g、こ→個)", () => {
    expect(parseQuantity("100グラム")).toEqual({ kind: "amount", value: 100, unit: "g" });
    expect(parseQuantity("1kg")).toEqual({ kind: "amount", value: 1000, unit: "g" });
    expect(parseQuantity("0.5L")).toMatchObject({ unit: "ml", value: 500 });
    expect(parseQuantity("2こ")).toEqual({ kind: "amount", value: 2, unit: "個" });
  });
  it("付け足しの言葉は無視する(約・ほど・かっこ)", () => {
    expect(parseQuantity("約200g")).toEqual({ kind: "amount", value: 200, unit: "g" });
    expect(parseQuantity("1個(約200g)")).toEqual({ kind: "amount", value: 1, unit: "個" });
    expect(parseQuantity("100gほど")).toEqual({ kind: "amount", value: 100, unit: "g" });
  });
  it("足せないものは、そのまま見せる", () => {
    for (const t of ["少々", "適量", "ひとつまみ", "お好みで", "2〜3個", "2~3個", "ふたつかみ"]) {
      expect(parseQuantity(t)).toMatchObject({ kind: "text" });
    }
    expect(parseQuantity("2〜3個")).toEqual({ kind: "text", text: "2〜3個" });
    expect(parseQuantity("")).toEqual({ kind: "none" });
    expect(parseQuantity("  ")).toEqual({ kind: "none" });
  });
  it("ゼロ割りや壊れた分数で落ちない", () => {
    expect(() => parseQuantity("1/0個")).not.toThrow();
    expect(parseQuantity("1/0個")).toEqual({ kind: "text", text: "1/0個" });
  });
});

describe("nameKey", () => {
  it("全角半角・カタカナ・空白・かっこの違いを無視する", () => {
    expect(nameKey("玉ねぎ")).toBe(nameKey(" 玉ねぎ(みじん切り)"));
    expect(nameKey("ニンジン")).toBe(nameKey("にんじん"));
    expect(nameKey("ＡＢＣ")).toBe(nameKey("abc"));
    expect(nameKey("玉ねぎ")).not.toBe(nameKey("たまねぎ")); // 漢字とかなは別(同じ名前だけ足す)
  });
});

describe("classify", () => {
  it("売り場を推定する", () => {
    expect(classify("玉ねぎ")).toBe("野菜・果物");
    expect(classify("鶏もも肉")).toBe("肉・魚");
    expect(classify("卵")).toBe("卵・乳製品");
    expect(classify("木綿豆腐")).toBe("豆腐・乾物など");
    expect(classify("ご飯")).toBe("米・麺・パン");
    expect(classify("しょうゆ")).toBe("調味料・油");
    expect(classify("謎の食材")).toBe("その他");
  });
  it("長く一致した言葉を優先する", () => {
    expect(classify("油揚げ")).toBe("豆腐・乾物など"); // 「油」ではない
    expect(classify("ごま油")).toBe("調味料・油"); // 「ごま」ではない
    expect(classify("鶏がらスープの素")).toBe("調味料・油"); // 「鶏」ではない
    expect(classify("水菜")).toBe("野菜・果物"); // 「水」ではない
  });
});

describe("buildShoppingList", () => {
  const curry = recipe("r1", "カレー", {
    servings: 2,
    ingredients: [{ name: "玉ねぎ", quantity: "1個" }, { name: "鶏もも肉", quantity: "1枚" }, { name: "塩", quantity: "少々" }],
    seasonings: [{ name: "カレールー", quantity: "4皿分" }, { name: "しょうゆ", quantity: "大さじ1" }],
  });
  const soup = recipe("r2", "スープ", {
    ingredients: [{ name: "玉ねぎ", quantity: "2個" }, { name: "たまねぎ", quantity: "1個" }, { name: "鶏もも肉", quantity: "300g" }, { name: "塩", quantity: "適量" }],
    seasonings: [{ name: "しょうゆ", quantity: "小さじ1" }],
    extraGroups: [{ name: "トッピング", items: [{ name: "パセリ", quantity: "" }] }],
  });
  const recipes = [curry, soup];
  const item = (list: ReturnType<typeof buildShoppingList>, name: string) => list.groups.flatMap((g) => g.items).find((i) => i.name === name);

  it("同じ名前・同じ単位だけ足す(違う単位は並べる)", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1"), entry("b", "2026-10-06", "r2")], recipes, "2026-10-05", "2026-10-06");
    expect(item(l, "玉ねぎ")?.amounts).toEqual(["3個"]);
    expect(item(l, "鶏もも肉")?.amounts).toEqual(["1枚", "300g"]);
    expect(item(l, "たまねぎ")?.amounts).toEqual(["1個"]); // かなと漢字は別の材料
    expect(item(l, "しょうゆ")?.amounts).toEqual(["大さじ1", "小さじ1"]); // 大さじと小さじは足さない
    expect(l.dishCount).toBe(2);
    expect(l.dayCount).toBe(2);
  });

  it("「少々」「適量」は足さず、書いてあるとおりに並べる", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1"), entry("b", "2026-10-06", "r2")], recipes, "2026-10-05", "2026-10-06");
    expect(item(l, "塩")?.amounts).toEqual([]);
    expect(item(l, "塩")?.notes).toEqual(["少々", "適量"]);
    expect(describeItem(item(l, "塩")!)).toBe("少々、適量");
    expect(describeItem(item(l, "玉ねぎ")!)).toBe("3個");
    expect(item(l, "パセリ")?.amounts).toEqual([]);
    expect(describeItem(item(l, "パセリ")!)).toBe("");
  });

  it("売り場ごとに分け、調味料の欄の材料は調味料に入れる", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1")], recipes, "2026-10-05", "2026-10-05");
    const where = (n: string) => l.groups.find((g) => g.items.some((i) => i.name === n))?.group;
    expect(where("玉ねぎ")).toBe("野菜・果物");
    expect(where("鶏もも肉")).toBe("肉・魚");
    expect(where("しょうゆ")).toBe("調味料・油");
    expect(where("カレールー")).toBe("調味料・油");
    expect(l.groups.map((g) => g.group)).toEqual(["野菜・果物", "肉・魚", "調味料・油"]); // 材料のない売り場は出さない
  });

  it("人数が違うときは、分量を人数の比で増減する(少々などはそのまま)", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1", 4)], recipes, "2026-10-05", "2026-10-05");
    expect(item(l, "玉ねぎ")?.amounts).toEqual(["2個"]);
    expect(item(l, "しょうゆ")?.amounts).toEqual(["大さじ2"]);
    expect(item(l, "塩")?.notes).toEqual(["少々"]);
    const half = buildShoppingList([entry("a", "2026-10-05", "r1", 1)], recipes, "2026-10-05", "2026-10-05");
    expect(item(half, "玉ねぎ")?.amounts).toEqual(["0.5個"]);
  });

  it("レシピに人数がないときは、書かれた分量のまま", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r2", 4)], recipes, "2026-10-05", "2026-10-05");
    expect(item(l, "玉ねぎ")?.amounts).toEqual(["2個"]);
  });

  it("期間の外の献立は入れない(両端の日は入れる)", () => {
    const l = buildShoppingList(
      [entry("a", "2026-10-04", "r1"), entry("b", "2026-10-05", "r1"), entry("c", "2026-10-07", "r1"), entry("d", "2026-10-08", "r1")],
      recipes, "2026-10-05", "2026-10-07");
    expect(l.dishCount).toBe(2);
    expect(item(l, "玉ねぎ")?.amounts).toEqual(["2個"]);
  });

  it("同じ日に同じレシピを2回入れたら2回ぶん足す", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1"), entry("b", "2026-10-05", "r1")], recipes, "2026-10-05", "2026-10-05");
    expect(item(l, "玉ねぎ")?.amounts).toEqual(["2個"]);
  });

  it("削除されたレシピは数えず、missing に残す", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "gone"), entry("b", "2026-10-05", "r1")], recipes, "2026-10-05", "2026-10-05");
    expect(l.missing).toEqual([{ date: "2026-10-05" }]);
    expect(l.dishCount).toBe(1);
  });

  it("内訳(どのレシピで、いくつ使うか)を持つ", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1"), entry("b", "2026-10-06", "r2")], recipes, "2026-10-05", "2026-10-06");
    expect(item(l, "玉ねぎ")?.sources).toEqual([
      { recipeName: "カレー", date: "2026-10-05", quantity: "1個" },
      { recipeName: "スープ", date: "2026-10-06", quantity: "2個" },
    ]);
  });

  it("逆順・空の期間は空のリスト", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1")], recipes, "2026-10-07", "2026-10-05");
    expect(l.groups).toEqual([]);
    expect(l.dayCount).toBe(0);
  });
});

describe("shoppingToText", () => {
  it("売り場ごとの文章にして、チェック済みには ✓ を付ける", () => {
    const l = buildShoppingList([entry("a", "2026-10-05", "r1")], [recipe("r1", "カレー", { ingredients: [{ name: "玉ねぎ", quantity: "1個" }, { name: "鶏もも肉", quantity: "1枚" }] })], "2026-10-05", "2026-10-11");
    const t = shoppingToText(l, "2026-10-05", "2026-10-11", new Set([nameKey("玉ねぎ")]));
    expect(t).toContain("買い物リスト(10月5日(月) 〜 10月11日(日))");
    expect(t).toContain("■野菜・果物\n✓玉ねぎ 1個");
    expect(t).toContain("■肉・魚\n・鶏もも肉 1枚");
  });
});
