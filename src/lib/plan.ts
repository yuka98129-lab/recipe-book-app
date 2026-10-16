import { isServings } from "./servings";

// 献立カレンダー。「何日に、どのレシピを、何人分で作るか」を1件ずつ記録する。

export type PlanEntry = {
  id: string;
  /** 作る日(YYYY-MM-DD。端末の日付) */
  date: string;
  recipeId: string;
  /** 何人分で作るか。レシピに人数が入っていないときや、レシピのままなら null */
  servings: number | null;
};

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 実在する日付(YYYY-MM-DD)か。2026-02-30 のような日は false */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export function dateKey(y: number, month0: number, d: number): string {
  const dt = new Date(y, month0, d);
  return `${String(dt.getFullYear()).padStart(4, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export const todayKey = (now = new Date()) => dateKey(now.getFullYear(), now.getMonth(), now.getDate());

/** YYYY-MM-DD に n 日足す(月またぎ・うるう年に対応) */
export function addDays(key: string, n: number): string {
  const m = DATE_RE.exec(key);
  if (!m) return key;
  return dateKey(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n);
}

/** 月曜=0 ... 日曜=6 */
export function weekdayIndex(key: string): number {
  const m = DATE_RE.exec(key);
  if (!m) return 0;
  return (new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() + 6) % 7;
}

/** 「10月6日(月)」 */
export function formatDay(key: string): string {
  const m = DATE_RE.exec(key);
  if (!m) return key;
  return `${Number(m[2])}月${Number(m[3])}日(${WEEKDAYS[weekdayIndex(key)]})`;
}

/** その月のカレンダー(月曜始まり)。前後の月の日も含めて、週ごとに7日ずつ */
export function monthGrid(year: number, month0: number): string[][] {
  const first = dateKey(year, month0, 1);
  const start = addDays(first, -weekdayIndex(first));
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const weeks = Math.ceil((weekdayIndex(first) + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** from〜to(両端を含む)の日付の一覧。逆順・長すぎる範囲は空 */
export function daysBetween(from: string, to: string, max = 100): string[] {
  if (!isDateKey(from) || !isDateKey(to) || from > to) return [];
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > max) return [];
  }
  return days;
}

/** 保存データ・サーバーの値を検証して取り出す。壊れていれば null */
export function parsePlanEntry(v: unknown): PlanEntry | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "" || r.id.length > 100) return null;
  if (!isDateKey(r.date)) return null;
  if (typeof r.recipeId !== "string" || r.recipeId === "" || r.recipeId.length > 100) return null;
  return { id: r.id, date: r.date, recipeId: r.recipeId, servings: isServings(r.servings) ? r.servings : null };
}

export const sortEntries = (list: PlanEntry[]) =>
  [...list].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
