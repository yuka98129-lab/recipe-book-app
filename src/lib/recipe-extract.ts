import { isCookingMinutes } from "./cooking-time";
import { MAX_TAGS, SUGGESTED_TAGS } from "./constants";
import { isServings } from "./servings";
import type { Ingredient } from "./types";

// 写真・文章からレシピを読み取る機能の、サーバーとブラウザで共通の部分(通信は使わない)。
// AI の答えは「確認前の下書き」。必ずここで形を整え、人が確認してから登録する。

/** 1回に読み取れる写真の枚数(手書きのメモが何枚かにまたがる場合を想定) */
export const MAX_READ_IMAGES = 3;
/** 貼りつけられる文章の上限(文字数) */
export const MAX_READ_TEXT_CHARS = 8000;
/** これより短い文章だけでは、読み取りを始めない */
export const MIN_READ_TEXT_CHARS = 10;

export type ExtractedRecipe = {
  name: string;
  /** 候補のカテゴリーに当てはまるものがあるときだけ。無ければ null(人が選ぶ) */
  category: string | null;
  tags: string[];
  cookingMinutes: number | null;
  /** 材料が何人分か(書かれている場合だけ) */
  servings: number | null;
  ingredients: Ingredient[];
  seasonings: Ingredient[];
  steps: string[];
  /** 読み取りに自信がない箇所・読めなかった箇所(人が確認するための注意書き) */
  uncertain: string[];
};

const LIMITS = {
  name: 100,
  category: 30,
  tag: 20,
  rows: 60,
  ingredientName: 80,
  quantity: 40,
  steps: 40,
  step: 1000,
  uncertain: 20,
  uncertainText: 200,
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 文字列だけを取り出し、前後の空白を除いて、長すぎれば切る */
function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseRows(v: unknown): Ingredient[] {
  if (!Array.isArray(v)) return [];
  const rows: Ingredient[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const name = text(item.name, LIMITS.ingredientName);
    if (!name) continue; // 名前が空の行は捨てる(フォームの cleanRows と同じ)
    rows.push({ name, quantity: text(item.quantity, LIMITS.quantity) });
    if (rows.length >= LIMITS.rows) break;
  }
  return rows;
}

function parseStrings(v: unknown, count: number, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => text(s, max))
    .filter(Boolean)
    .slice(0, count);
}

/**
 * AI が返した内容を、安全な形に整える。
 * 想定外の形・型は捨て、長さを制限する。レシピとして何も読み取れていなければ null。
 */
export function parseExtraction(raw: unknown): ExtractedRecipe | null {
  if (!isRecord(raw)) return null;

  // 重複を除いてから、最大数に切る
  const tags = [...new Set(parseStrings(raw.tags, 50, LIMITS.tag))].slice(0, MAX_TAGS);
  const category = text(raw.category, LIMITS.category);

  const result: ExtractedRecipe = {
    name: text(raw.name, LIMITS.name),
    category: category || null,
    tags,
    cookingMinutes: isCookingMinutes(raw.cookingMinutes) ? raw.cookingMinutes : null,
    servings: isServings(raw.servings) ? raw.servings : null,
    ingredients: parseRows(raw.ingredients),
    seasonings: parseRows(raw.seasonings),
    steps: parseStrings(raw.steps, LIMITS.steps, LIMITS.step),
    uncertain: parseStrings(raw.uncertain, LIMITS.uncertain, LIMITS.uncertainText),
  };

  const nothingRead =
    !result.name && result.ingredients.length === 0 && result.seasonings.length === 0 && result.steps.length === 0;
  return nothingRead ? null : result;
}

/** フォームの入力欄に入れる形(空欄は、フォームと同じく空の1行から始める) */
export type FormValues = {
  name: string;
  /** 既存のカテゴリーに当てはまるときだけ。そうでなければ null(いまの選択を変えない) */
  category: string | null;
  tags: string[];
  cookingMinutes: string;
  servings: string;
  ingredients: Ingredient[];
  seasonings: Ingredient[];
  steps: string[];
};

const blankRow = (): Ingredient => ({ name: "", quantity: "" });

export function extractionToFormValues(ex: ExtractedRecipe, categories: string[]): FormValues {
  return {
    name: ex.name,
    category: ex.category !== null && categories.includes(ex.category) ? ex.category : null,
    // 自由入力のタグも、読み取り結果としては受け入れる(最大数は parseExtraction で制限済み)
    tags: ex.tags,
    cookingMinutes: ex.cookingMinutes === null ? "" : String(ex.cookingMinutes),
    servings: ex.servings === null ? "" : String(ex.servings),
    ingredients: ex.ingredients.length > 0 ? ex.ingredients : [blankRow()],
    seasonings: ex.seasonings.length > 0 ? ex.seasonings : [blankRow()],
    steps: ex.steps.length > 0 ? ex.steps : [""],
  };
}

/** タグの候補(読み取りのときは、この中から選ばせる) */
export const READ_TAG_CHOICES = SUGGESTED_TAGS;
