import { describe, expect, it } from "vitest";
import {
  cleanExtraGroups,
  cleanRows,
  isBlankRow,
  nextRowAfter,
} from "./ingredient-groups";
import type { Ingredient } from "./types";

const row = (name: string, quantity = ""): Ingredient => ({ name, quantity });
const blank = row("");

describe("cleanRows", () => {
  it("前後の空白を取り除き、名前が空の行を除く", () => {
    expect(cleanRows([row(" えのき ", " 1袋 "), blank, row("  ", "少々"), row("オクラ")])).toEqual([
      row("えのき", "1袋"),
      row("オクラ"),
    ]);
  });
});

describe("cleanExtraGroups", () => {
  it("名前と中身が空のグループ(押しただけ)は黙って捨てる", () => {
    const r = cleanExtraGroups([{ name: "  ", items: [blank] }]);
    expect(r).toEqual({ ok: true, groups: [] });
  });

  it("グループ名と中身を整えて返し、順序を保つ", () => {
    const r = cleanExtraGroups([
      { name: " トッピング ", items: [row("明太子", "大さじ2"), blank] },
      { name: "ソース", items: [row("生クリーム", "100ml")] },
    ]);
    expect(r).toEqual({
      ok: true,
      groups: [
        { name: "トッピング", items: [row("明太子", "大さじ2")] },
        { name: "ソース", items: [row("生クリーム", "100ml")] },
      ],
    });
  });

  it("名前がなく中身だけ入力されている場合はエラー(入力を失わせない)", () => {
    const r = cleanExtraGroups([{ name: "", items: [row("明太子")] }]);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("グループ名");
  });

  it("名前だけで中身がない場合はエラー", () => {
    const r = cleanExtraGroups([{ name: "トッピング", items: [blank] }]);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("トッピング");
  });

  it("「材料」「調味料」と同じ名前は使えない", () => {
    expect(cleanExtraGroups([{ name: "材料", items: [row("a")] }])).toMatchObject({ ok: false });
    expect(cleanExtraGroups([{ name: " 調味料 ", items: [row("a")] }])).toMatchObject({ ok: false });
  });

  it("追加グループ同士の名前の重複はエラー", () => {
    const r = cleanExtraGroups([
      { name: "トッピング", items: [row("a")] },
      { name: "トッピング", items: [row("b")] },
    ]);
    expect(r).toMatchObject({ ok: false });
  });

  it("いくつでも追加できる", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `グループ${i}`, items: [row("a")] }));
    const r = cleanExtraGroups(many);
    expect(r.ok && r.groups).toHaveLength(20);
  });
});

describe("isBlankRow", () => {
  it("名前も分量も空白だけなら空欄", () => {
    expect(isBlankRow(row("  ", " "))).toBe(true);
    expect(isBlankRow(row("えのき"))).toBe(false);
    expect(isBlankRow(row("", "少々"))).toBe(false);
  });
});

describe("nextRowAfter (Enter で次の行へ)", () => {
  it("最後の行に入力があれば、下に空の行を足してそこへ移る", () => {
    const rows = [row("えのき")];
    expect(nextRowAfter(rows, 0)).toEqual({ rows: [row("えのき"), blank], focusIndex: 1 });
  });

  it("分量だけ入力されている行でも追加できる", () => {
    expect(nextRowAfter([row("", "少々")], 0)?.rows).toHaveLength(2);
  });

  it("最後の行が空欄なら空の行を増やさない", () => {
    expect(nextRowAfter([row("えのき"), blank], 1)).toBeNull();
    expect(nextRowAfter([blank], 0)).toBeNull();
  });

  it("すぐ下に空の行がすでにあれば、増やさずにそこへ移る", () => {
    const rows = [row("えのき"), blank];
    const next = nextRowAfter(rows, 0)!;
    expect(next.rows).toBe(rows);
    expect(next.focusIndex).toBe(1);
  });

  it("途中の行でEnterを押すと、その下に挿入する", () => {
    const rows = [row("a"), row("b")];
    expect(nextRowAfter(rows, 0)).toEqual({ rows: [row("a"), blank, row("b")], focusIndex: 1 });
  });

  it("元の配列は変更しない", () => {
    const rows = [row("a")];
    nextRowAfter(rows, 0);
    expect(rows).toHaveLength(1);
  });
});
