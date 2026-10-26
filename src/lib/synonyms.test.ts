import { describe, expect, it } from "vitest";
import { buildSynonymIndex, cleanGroup, DEFAULT_INDEX, DEFAULT_SYNONYMS, splitGroup } from "./synonyms";

describe("cleanGroup / splitGroup", () => {
  it("重複(ひらがな・カタカナの違いも)・空を除き、2つ以上のときだけ有効", () => {
    expect(cleanGroup([" 白滝 ", "しらたき", "シラタキ", "", "糸こんにゃく"])).toEqual(["白滝", "しらたき", "糸こんにゃく"]);
    expect(cleanGroup(["白滝"])).toBeNull();
    expect(cleanGroup(["白滝", "しらたき ", "シラタキ"])).toEqual(["白滝", "しらたき"]);
    expect(cleanGroup("x")).toBeNull();
    expect(cleanGroup([1, 2])).toBeNull();
  });
  it("10語まで・30字まで・< > は除く", () => {
    const g = cleanGroup(Array.from({ length: 15 }, (_, i) => `ざいりょう${i}`))!;
    expect(g).toHaveLength(10);
    expect(cleanGroup(["あ".repeat(50), "い"])![0]).toHaveLength(30);
    expect(cleanGroup(["<b>豚</b>", "ぶた"])![0]).toBe("b豚/b");
  });
  it("「、」「,」「=」「/」で区切る", () => {
    expect(splitGroup("白滝、しらたき,糸こんにゃく")).toEqual(["白滝", "しらたき", "糸こんにゃく"]);
    expect(splitGroup("白滝=しらたき")).toEqual(["白滝", "しらたき"]);
    expect(splitGroup("白滝")).toBeNull();
    expect(splitGroup("")).toBeNull();
  });
});

describe("標準の言い換え", () => {
  it("どの組も、2つ以上の言葉があり、同じ言葉が、別の組に重ならない(標準どうしで食い違わない)", () => {
    for (const g of DEFAULT_SYNONYMS) expect(cleanGroup(g)).toEqual(g);
    const seen = new Map<string, string>();
    for (const g of DEFAULT_SYNONYMS) {
      for (const w of g) {
        const k = w.normalize("NFKC").toLowerCase();
        expect(seen.has(k) ? `${k} は ${seen.get(k)} にも` : "ok").toBe("ok");
        seen.set(k, g[0]);
      }
    }
  });
  it("漢字とかなを同じとみなす。まったく別の材料は、同じとみなさない", () => {
    const s = DEFAULT_INDEX.same;
    expect(s("白滝", "しらたき")).toBe(true);
    expect(s("白滝", "糸こんにゃく")).toBe(true);
    expect(s("人参", "ニンジン")).toBe(true);
    expect(s("玉葱", "たまねぎ")).toBe(true);
    expect(s("醤油", "しょうゆ")).toBe(true);
    expect(s("鶏肉", "鶏もも肉")).toBe(true);
    expect(s("白滝", "豆腐")).toBe(false);
    expect(s("玉ねぎ", "長ねぎ")).toBe(false);
    expect(s("豚肉", "牛肉")).toBe(false);
    expect(s("みかん", "りんご")).toBe(false);
  });
  it("名前に、言い換えの言葉がふくまれていれば、同じ組(「しらたき(アク抜き済み)」)", () => {
    expect(DEFAULT_INDEX.same("白滝", "しらたき(アク抜き済み)")).toBe(true);
    expect(DEFAULT_INDEX.same("木綿豆腐", "とうふ")).toBe(true);
  });
  it("1文字の言葉(卵・鮭の1字…)は、同じときだけ。「ゆで卵」は、卵の組にならない", () => {
    expect(DEFAULT_INDEX.same("卵", "たまご")).toBe(true);
    expect(DEFAULT_INDEX.same("ゆで卵", "たまご")).toBe(false);
  });
});

describe("buildSynonymIndex(自分で足した言い換え)", () => {
  const idx = buildSynonymIndex([...DEFAULT_SYNONYMS, ["あおじる", "青汁"]]);
  it("足した分も使える", () => {
    expect(idx.same("青汁", "あおじる")).toBe(true);
    expect(DEFAULT_INDEX.same("青汁", "あおじる")).toBe(false);
  });
  it("空の名前は、どれとも同じにならない", () => {
    expect(idx.same("", "あおじる")).toBe(false);
    expect(idx.groupsOf("").size).toBe(0);
  });
});
