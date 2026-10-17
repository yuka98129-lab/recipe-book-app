import type { Recipe } from "./types";

// 栄養素の「推定」。AI が、材料と分量から、材料ごとに計算した値(目安)。
// 合計と1人分は、材料ごとの値から、ここで計算する(AI に足し算をさせない)。

export const NUTRIENTS = [
  { key: "energyKcal", label: "エネルギー", unit: "kcal", digits: 0, max: 5000 },
  { key: "proteinG", label: "たんぱく質", unit: "g", digits: 1, max: 500 },
  { key: "fatG", label: "脂質", unit: "g", digits: 1, max: 500 },
  { key: "carbG", label: "炭水化物", unit: "g", digits: 1, max: 1000 },
  { key: "calciumMg", label: "カルシウム", unit: "mg", digits: 0, max: 5000 },
  { key: "ironMg", label: "鉄", unit: "mg", digits: 1, max: 100 },
  { key: "vitaminAUg", label: "ビタミンA", unit: "μgRAE", digits: 0, max: 20000 },
  { key: "vitaminCMg", label: "ビタミンC", unit: "mg", digits: 0, max: 2000 },
  { key: "vitaminDUg", label: "ビタミンD", unit: "μg", digits: 1, max: 500 },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export type NutrientValues = Record<NutrientKey, number>;

export type NutritionItem = {
  /** 材料・調味料の名前 */
  name: string;
  /** その材料の重さ(g)の見積もり。分からなければ null */
  grams: number | null;
  /** 野菜か(いも類・きのこ・海藻・豆類・果物は含めない) */
  isVegetable: boolean;
  /** 書かれた分量ぜんぶ(100gあたりではない)の栄養素 */
  values: NutrientValues;
  /** 見積もりの根拠・仮定(短く) */
  note: string;
};

export type NutritionEstimate = {
  items: NutritionItem[];
  /** AI が置いた仮定・自信がない所 */
  assumptions: string[];
  /** どの材料の内容で推定したか(材料を直したあと、古い推定だと気づくための印) */
  basis: string;
  /** 完成写真も参考にしたか */
  usedPhoto: boolean;
  estimatedAt: number;
};

const LIMITS = { items: 80, name: 80, note: 160, assumptions: 20, assumptionText: 200, grams: 5000 } as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 0 以上・上限以下の有限な数だけ。それ以外(欠け・負・文字・大きすぎ)は null */
function num(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
}

export const emptyValues = (): NutrientValues =>
  Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0])) as NutrientValues;

/** AI の返した材料ごとの行を、安全な形に整える。名前がない行・値が1つも読めない行は捨てる */
export function parseNutritionItems(raw: unknown): NutritionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: NutritionItem[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const name = str(r.name, LIMITS.name);
    if (!name) continue;
    const values = emptyValues();
    let any = false;
    // AI の返答は栄養素が行に平らに並ぶ形、サーバー・保存データは values の中に入る形。どちらも読む
    const src = isRecord(r.values) ? r.values : r;
    for (const n of NUTRIENTS) {
      const v = num(src[n.key], n.max);
      if (v !== null) {
        values[n.key] = v;
        any = true;
      }
    }
    if (!any) continue;
    items.push({
      name,
      grams: num(r.grams, LIMITS.grams),
      isVegetable: r.isVegetable === true,
      values,
      note: str(r.note, LIMITS.note),
    });
    if (items.length >= LIMITS.items) break;
  }
  return items;
}

export function parseAssumptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => str(s, LIMITS.assumptionText))
    .filter(Boolean)
    .slice(0, LIMITS.assumptions);
}

/** 保存済みの推定(localStorage・同期・バックアップ)を検証する。壊れていれば undefined(推定なし) */
export function parseStoredNutrition(raw: unknown): NutritionEstimate | undefined {
  if (!isRecord(raw)) return undefined;
  const items = parseNutritionItems(raw.items);
  if (items.length === 0) return undefined;
  if (typeof raw.basis !== "string" || raw.basis.length > 64) return undefined;
  if (typeof raw.estimatedAt !== "number" || !Number.isFinite(raw.estimatedAt)) return undefined;
  return {
    items,
    assumptions: parseAssumptions(raw.assumptions),
    basis: raw.basis,
    usedPhoto: raw.usedPhoto === true,
    estimatedAt: raw.estimatedAt,
  };
}

/** レシピ全体の合計 */
export function totalNutrition(items: NutritionItem[]): NutrientValues {
  const total = emptyValues();
  for (const it of items) for (const n of NUTRIENTS) total[n.key] += it.values[n.key];
  return total;
}

/** 野菜(いも類・きのこ・海藻・豆類・果物を除く)の重さの合計(g) */
export function vegetableGrams(items: NutritionItem[]): number {
  return items.reduce((sum, it) => (it.isVegetable && it.grams !== null ? sum + it.grams : sum), 0);
}

/**
 * たんぱく質・脂質・炭水化物が、この3つのエネルギーの合計の何%か(PFCバランス)。
 * 1gあたり、たんぱく質4kcal・脂質9kcal・炭水化物4kcal で計算する(%は、足して100になるよう整える)。
 * 3つとも0なら null。
 */
export function pfcShare(v: Pick<NutrientValues, "proteinG" | "fatG" | "carbG">): { p: number; f: number; c: number } | null {
  const p = v.proteinG * 4;
  const f = v.fatG * 9;
  const c = v.carbG * 4;
  const sum = p + f + c;
  if (!(sum > 0)) return null;
  const pp = Math.round((p / sum) * 100);
  const ff = Math.round((f / sum) * 100);
  return { p: pp, f: ff, c: 100 - pp - ff };
}

/** 人数で割る(人数は整数1以上) */
export function perServing(values: NutrientValues, servings: number): NutrientValues {
  const out = emptyValues();
  for (const n of NUTRIENTS) out[n.key] = values[n.key] / servings;
  return out;
}

/** 表示用の数字。0.04 のような小さい値も 0 にならないようにする */
export function formatAmount(v: number, digits: number): string {
  if (v > 0 && v < 10 ** -digits / 2) return `<${(10 ** -digits).toFixed(digits)}`;
  return v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 材料・調味料・追加グループの内容から作る短い印(djb2 ハッシュ)。名前と分量が変わると変わる */
export function nutritionBasis(r: Pick<Recipe, "ingredients" | "seasonings" | "extraGroups">): string {
  const s = JSON.stringify([r.ingredients, r.seasonings, r.extraGroups]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 保存された推定が、いまの材料と合っているか */
export const isNutritionCurrent = (r: Recipe, e: NutritionEstimate) => e.basis === nutritionBasis(r);
