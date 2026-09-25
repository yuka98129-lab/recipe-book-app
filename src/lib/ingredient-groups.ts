import type { Ingredient, IngredientGroup } from "./types";

/** 「材料」「調味料」は固定の枠なので、追加グループの名前には使えない */
export const FIXED_GROUP_NAMES = ["材料", "調味料"];

export const isBlankRow = (row: Ingredient) => !row.name.trim() && !row.quantity.trim();

/**
 * Enter で「次の行」へ進むときの行の並びと、カーソルを移す行の番号を返す。
 * - 今の行が空欄なら、空の行を増やさない(null)
 * - すぐ下にすでに空の行があれば、増やさずにそこへ移る
 * - それ以外は、今の行の下に空の行を1つ挿入して、そこへ移る
 */
export function nextRowAfter(
  rows: Ingredient[],
  index: number,
): { rows: Ingredient[]; focusIndex: number } | null {
  if (isBlankRow(rows[index])) return null;
  const below = rows[index + 1];
  if (below && isBlankRow(below)) return { rows, focusIndex: index + 1 };
  return {
    rows: [...rows.slice(0, index + 1), { name: "", quantity: "" }, ...rows.slice(index + 1)],
    focusIndex: index + 1,
  };
}

/** 前後の空白を取り除き、名前が空の行を除く */
export function cleanRows(rows: Ingredient[]): Ingredient[] {
  return rows
    .map((r) => ({ name: r.name.trim(), quantity: r.quantity.trim() }))
    .filter((r) => r.name);
}

export type CleanGroupsResult =
  | { ok: true; groups: IngredientGroup[] }
  | { ok: false; error: string };

/**
 * フォームの追加グループを保存用に整える。
 * - 名前も中身も空のグループ(押しただけ)は黙って捨てる
 * - 入力が片方だけ(名前だけ・中身だけ)の場合は、入力を失わないようエラーにする
 * - 「材料」「調味料」や他のグループと名前が重複する場合もエラーにする
 */
export function cleanExtraGroups(groups: IngredientGroup[]): CleanGroupsResult {
  const usedNames = new Set(FIXED_GROUP_NAMES);
  const result: IngredientGroup[] = [];

  for (const group of groups) {
    const name = group.name.trim();
    const items = cleanRows(group.items);

    if (!name && items.length === 0) continue;
    if (!name) return { ok: false, error: "グループ名を入力してください。" };
    if (items.length === 0) {
      return {
        ok: false,
        error: `「${name}」に名前と分量を1つ以上入力するか、グループを削除してください。`,
      };
    }
    if (usedNames.has(name)) {
      return { ok: false, error: `「${name}」というグループ名はすでに使われています。` };
    }

    usedNames.add(name);
    result.push({ name, items });
  }

  return { ok: true, groups: result };
}
