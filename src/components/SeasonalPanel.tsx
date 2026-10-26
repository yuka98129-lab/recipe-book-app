"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSynonymIndex } from "@/hooks/use-synonyms";
import { addDays, formatDay } from "@/lib/plan";
import { addPlanEntry } from "@/lib/plan-store";
import { monthOfKey, proposeMenu, seasonalIngredients } from "@/lib/seasonal";
import type { PlanEntry } from "@/lib/plan";
import type { Recipe } from "@/lib/types";

const DAYS = 7;

/** 旬の食材の献立案: 今月の旬を見せて、あなたのレシピから、1週間ぶんの主菜・副菜・汁物を、提案する */
export function SeasonalPanel({ recipes, entries, today }: { recipes: Recipe[]; entries: PlanEntry[]; today: string }) {
  const synonyms = useSynonymIndex();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const [message, setMessage] = useState("");

  const month = monthOfKey(today);
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i)), [today]);
  const menu = useMemo(() => (open ? proposeMenu(recipes, dates, seed, synonyms) : []), [open, recipes, dates, seed, synonyms]);
  const total = menu.reduce((n, d) => n + d.items.length, 0);

  function apply() {
    let added = 0;
    try {
      for (const day of menu)
        for (const it of day.items) {
          if (entries.some((e) => e.date === day.date && e.recipeId === it.recipe.id)) continue;
          addPlanEntry({ date: day.date, recipeId: it.recipe.id, servings: it.recipe.servings ?? null });
          added++;
        }
      setMessage(added > 0 ? `${added}品を、献立に入れました。` : "すでに、ぜんぶ入っています。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "入れられませんでした。");
    }
  }

  return (
    <section aria-label="旬の食材の献立案" className="rounded-2xl bg-white p-4 shadow-pop">
      <h2 className="font-black">旬の食材で、献立を考える</h2>
      <p className="mt-1 text-sm text-stone-600">{month}月が旬の食材(だいたいの目安):</p>
      <p className="mt-1 flex flex-wrap gap-1.5">
        {seasonalIngredients(month).map((s) => (
          <span key={s} className="rounded-full bg-mintbg px-2.5 py-0.5 text-xs font-bold text-teal-900">
            {s}
          </span>
        ))}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage("");
          }}
          className="btn-pop mt-3 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 sm:py-2"
        >
          1週間の献立を、提案してもらう
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          {total === 0 ? (
            <p className="rounded-xl bg-butter p-3 text-sm font-bold text-amber-900">
              {recipes.length === 0
                ? "レシピがまだありません。先にレシピを登録してください。"
                : "旬の食材を使うレシピが、見つかりませんでした。材料の名前を、「さつまいも」のように、ふつうの名前で入れると、見つかりやすくなります。"}
            </p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-line rounded-xl border-2 border-line">
              {menu
                .filter((d) => d.items.length > 0)
                .map((d) => (
                  <li key={d.date} className="px-3 py-2">
                    <p className="text-sm font-black text-ink">{formatDay(d.date)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {d.items.map((it) => (
                        <li key={it.recipe.id} className="text-sm">
                          <span className="mr-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-black text-orange-800">{it.slot}</span>
                          <Link href={`/recipes/${it.recipe.id}`} className="break-words font-bold text-orange-800 underline">
                            {it.recipe.name}
                          </Link>
                          <span className="ml-2 text-xs text-stone-600">旬: {it.hits.slice(0, 3).join("・")}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {total > 0 && (
              <button type="button" onClick={apply} className="btn-pop rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 sm:py-2">
                この案を、献立に入れる
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSeed((s) => s + 1);
                setMessage("");
              }}
              className="rounded-xl border-2 border-line bg-white px-4 py-2.5 text-sm font-bold shadow-pop-sm hover:bg-orange-50 sm:py-2"
            >
              別の案
            </button>
            <button type="button" onClick={() => setOpen(false)} className="py-2 text-sm text-stone-600 underline">
              閉じる
            </button>
          </div>
          {message && (
            <p role="status" className="rounded-xl bg-mintbg px-3 py-2 text-sm font-bold text-teal-900">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
