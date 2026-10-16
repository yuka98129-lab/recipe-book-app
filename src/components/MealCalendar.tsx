"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlan } from "@/hooks/use-plan";
import { useRecipes } from "@/hooks/use-recipes";
import { useSync } from "@/hooks/use-sync";
import { addDays, formatDay, monthGrid, todayKey, WEEKDAYS, weekdayIndex } from "@/lib/plan";
import { addPlanEntry, removePlanEntry, setPlanServings } from "@/lib/plan-store";
import { MAX_SERVINGS, parseServings } from "@/lib/servings";
import type { Recipe } from "@/lib/types";

const norm = (s: string) => s.normalize("NFKC").toLowerCase();
const dayColor = (key: string) => (weekdayIndex(key) === 5 ? "text-blue-700" : weekdayIndex(key) === 6 ? "text-red-700" : "text-stone-800");

/** 1日ぶんの献立。料理を足す・人数を変える・外す */
function DayPanel({ date, recipes }: { date: string; recipes: Recipe[] }) {
  const { entries } = usePlan();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const today = entries.filter((e) => e.date === date);
  const byId = new Map(recipes.map((r) => [r.id, r]));

  const candidates = useMemo(() => {
    const q = norm(query.trim());
    return recipes.filter((r) => !q || norm(r.name).includes(q) || r.tags.some((t) => norm(t).includes(q)) || norm(r.category).includes(q)).slice(0, 30);
  }, [recipes, query]);

  function add(r: Recipe) {
    try {
      addPlanEntry({ date, recipeId: r.id, servings: r.servings ?? null });
      setError("");
      setAdding(false);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加できませんでした。");
    }
  }

  return (
    <section aria-label={`${formatDay(date)}の献立`} className="rounded-2xl border-2 border-orange-200 bg-white p-4">
      <h2 className="font-black">{formatDay(date)}の献立</h2>

      {today.length === 0 && <p className="mt-2 text-sm text-stone-500">まだ入っていません。</p>}
      <ul className="mt-2 divide-y-2 divide-dashed divide-line">
        {today.map((e) => {
          const r = byId.get(e.recipeId);
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              {r ? (
                <Link href={`/recipes/${r.id}`} className="min-w-0 basis-full break-words font-bold text-orange-800 underline sm:basis-0 sm:flex-1">
                  {r.name}
                </Link>
              ) : (
                <span className="min-w-0 basis-full text-stone-500 sm:basis-0 sm:flex-1">(削除されたレシピ)</span>
              )}
              {r?.servings !== undefined && (
                <label className="flex items-center gap-1 text-sm text-stone-600">
                  <span className="sr-only">{r.name}を何人分で作るか</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={String(e.servings ?? r.servings)}
                    key={`${e.id}-${e.servings}`}
                    aria-label={`${r.name}を何人分で作るか`}
                    onBlur={(ev) => {
                      const n = parseServings(ev.target.value);
                      if (n === null) {
                        setError(`人数は、1〜${MAX_SERVINGS}の整数で入力してください。`);
                        ev.target.value = String(e.servings ?? r.servings);
                        return;
                      }
                      setError("");
                      setPlanServings(e.id, n === undefined || n === r.servings ? null : n);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                    className="w-14 rounded-xl border-2 border-line px-2 py-1.5 text-right"
                  />
                  人分
                  {r.servings !== (e.servings ?? r.servings) && <span className="text-xs text-stone-500">(レシピは{r.servings}人分)</span>}
                </label>
              )}
              <button
                type="button"
                onClick={() => removePlanEntry(e.id)}
                aria-label={`${r?.name ?? "この献立"}を${formatDay(date)}から外す`}
                className="px-2 py-1.5 text-sm text-stone-500 hover:text-red-600"
              >
                ✕ 外す
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="料理名・タグ・カテゴリーで探す"
            aria-label="入れる料理を探す"
            autoFocus
            className="w-full rounded-xl border-2 border-line px-3 py-2 outline-none focus:border-orange-500"
          />
          {recipes.length === 0 ? (
            <p className="text-sm text-stone-500">レシピがまだありません。先にレシピを登録してください。</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-stone-500">見つかりませんでした。</p>
          ) : (
            <ul className="max-h-64 divide-y-2 divide-dashed divide-line overflow-y-auto rounded-xl border-2 border-line">
              {candidates.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => add(r)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-orange-50">
                    <span className="min-w-0 flex-1 break-words">{r.name}</span>
                    <span className="shrink-0 text-xs text-stone-500">{r.category}</span>
                    <span className="shrink-0 text-sm text-orange-700">＋ 入れる</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => { setAdding(false); setQuery(""); }} className="py-1 text-sm text-stone-600 underline">
            閉じる
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 rounded-xl border-2 border-dashed border-orange-300 bg-white px-4 py-2.5 text-sm font-black text-orange-700 hover:bg-orange-50 sm:py-2">
          ＋ 料理を入れる
        </button>
      )}

      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

/** 月のカレンダー(月曜始まり)。日をタップして、その日の献立を入れる */
export function MealCalendar() {
  const { entries } = usePlan();
  const { recipes, ready } = useRecipes();
  const sync = useSync();
  const today = todayKey();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));

  const weeks = monthGrid(ym.y, ym.m);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const byDate = new Map<string, string[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), byId.get(e.recipeId)?.name ?? "(削除済み)"]);

  const move = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };
  const rangeOk = from !== "" && to !== "" && from <= to;

  if (!ready) return <div className="h-40 animate-pulse rounded-2xl bg-orange-100" aria-busy="true" />;

  return (
    <div className="space-y-5">
      {sync.planMessage && (
        <p role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{sync.planMessage}</p>
      )}

      <section aria-label="買い物リストを作る" className="rounded-2xl bg-white shadow-pop p-4">
        <h2 className="font-black">買い物リストを作る</h2>
        <p className="mt-1 text-sm text-stone-600">買い物に行く日から、次の買い物の日までの材料を、まとめて出します。</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-stone-700">買い物の日(この日から)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-stone-700">次の買い物の日(この日まで)</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" />
          </label>
          {rangeOk ? (
            <Link href={`/plan/shopping?from=${from}&to=${to}`} className="btn-pop rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 sm:py-2">
              買い物リストを見る
            </Link>
          ) : (
            <span className="py-2 text-sm text-red-700">「この日から」が「この日まで」より後になっています。</span>
          )}
        </div>
      </section>

      <section aria-label="カレンダー">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label="前の月" className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-3 py-2 text-sm hover:bg-orange-50">◀</button>
          <h2 className="text-lg font-black">{ym.y}年{ym.m + 1}月</h2>
          <button type="button" onClick={() => move(1)} aria-label="次の月" className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-3 py-2 text-sm hover:bg-orange-50">▶</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-1.5 font-black ${i === 5 ? "text-blue-700" : i === 6 ? "text-red-700" : "text-stone-600"}`}>{w}</div>
          ))}
          {weeks.flat().map((key) => {
            const names = byDate.get(key) ?? [];
            const inMonth = key.slice(0, 7) === `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={`${formatDay(key)}${names.length > 0 ? `、${names.length}品` : ""}`}
                aria-pressed={selected === key}
                className={`flex min-h-16 flex-col items-stretch gap-0.5 rounded-xl bg-white p-1 text-left shadow-pop-sm sm:min-h-24 ${
                  selected === key ? "ring-4 ring-sun" : "hover:bg-orange-50"
                } ${inMonth ? "" : "bg-transparent opacity-40 shadow-none"}`}
              >
                <span className={`text-xs font-extrabold ${key === today ? "inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-orange-600 text-white shadow-[0_2px_0_var(--color-orange-900)]" : dayColor(key)}`}>
                  {Number(key.slice(8))}
                </span>
                {names.slice(0, 3).map((n, i) => (
                  <span key={i} className="hidden truncate rounded-md bg-orange-50 px-1 text-[11px] font-bold leading-4 text-orange-900 sm:block">{n}</span>
                ))}
                {names.length > 0 && <span className="text-[11px] font-extrabold text-mint-d sm:hidden">● {names.length}品</span>}
                {names.length > 3 && <span className="hidden text-[11px] text-stone-500 sm:block">ほか{names.length - 3}品</span>}
              </button>
            );
          })}
        </div>
      </section>

      <DayPanel date={selected} recipes={recipes} />
    </div>
  );
}
