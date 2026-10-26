"use client";

import { useMemo, useState } from "react";
import { findByFridge, nearestByFridge, popularIngredients, splitHave } from "@/lib/fridge";
import type { Recipe } from "@/lib/types";
import { RecipeCard } from "./RecipeCard";
import { TagChip } from "./TagChip";

type Props = {
  /** カテゴリー・タグで絞った後のレシピ */
  recipes: Recipe[];
  /** いまある材料(URLに持つ) */
  have: string[];
  onChange: (have: string[]) => void;
};

/** 「冷蔵庫にある材料」を入れると、作れる料理を、そろっている順に出す */
export function FridgeFinder({ recipes, have, onChange }: Props) {
  const [text, setText] = useState("");
  const [withSeasonings, setWithSeasonings] = useState(false);

  const add = (items: string[]) => onChange(splitHave([...have, ...items].join(" ")));
  const commit = () => {
    if (text.trim()) add([text]);
    setText("");
  };

  const suggestions = useMemo(() => popularIngredients(recipes, have), [recipes, have]);
  const matches = useMemo(() => findByFridge(recipes, have, { includeSeasonings: withSeasonings }), [recipes, have, withSeasonings]);
  const nearest = useMemo(
    () => (have.length > 0 && matches.length === 0 ? nearestByFridge(recipes, have, 5, { includeSeasonings: withSeasonings }) : []),
    [recipes, have, withSeasonings, matches.length],
  );

  const sections = [0, 1, 2].map((n) => ({ n, items: matches.filter((m) => m.missing.length === n) })).filter((s) => s.items.length > 0);
  const title = (n: number) => (n === 0 ? "いま作れる(材料がぜんぶそろっています)" : `あと${n}つで作れる`);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-3 shadow-pop-sm">
        <label htmlFor="fridge-input" className="mb-1 block text-sm font-black text-ink">
          冷蔵庫にある材料
        </label>
        <div className="flex gap-2">
          <input
            id="fridge-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 変換中の Enter は、確定のためなので、追加しない
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="材料を入れる(例: キャベツ)"
            className="w-full rounded-xl border-2 border-line bg-white px-3 py-2 font-bold outline-none focus:border-orange-500"
          />
          <button
            type="button"
            onClick={commit}
            className="btn-pop shrink-0 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"
          >
            入れる
          </button>
        </div>
        {have.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {have.map((h) => (
              <TagChip key={h} label={h} onRemove={() => onChange(have.filter((x) => x !== h))} />
            ))}
            <button type="button" onClick={() => onChange([])} className="py-2 text-sm text-orange-700 underline sm:py-0">
              ぜんぶ消す
            </button>
          </div>
        )}
        {suggestions.length > 0 && (
          // 材料が入ったあとは、場所をとらないよう、たたんでおく
          <details open={have.length === 0} className="mt-3">
            <summary className="text-xs font-bold text-stone-600">よく使う材料から選ぶ(押すと、入ります)</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <TagChip key={s} label={s} onClick={() => add([s])} />
              ))}
            </div>
          </details>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={withSeasonings} onChange={(e) => setWithSeasonings(e.target.checked)} className="h-5 w-5" />
          調味料も、あるかどうか数える(ふつうは、家にあるものとします)
        </label>
      </div>

      {have.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-stone-600 shadow-pop">
          材料を入れると、作れる料理が出ます。「あと◯◯だけあれば作れる」料理も分かります。
        </p>
      ) : matches.length > 0 ? (
        sections.map((s) => (
          <section key={s.n}>
            <h2 className="mb-2 flex items-center gap-2 text-base font-black text-orange-700">
              <span className="rounded-full bg-orange-100 px-3 py-0.5">{title(s.n)}</span>
              <span className="text-xs font-bold text-stone-500">{s.items.length}件</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.items.map((m) => (
                <RecipeCard key={m.recipe.id} recipe={m.recipe} fridge={{ used: m.used, missing: m.missing }} />
              ))}
            </div>
          </section>
        ))
      ) : nearest.length > 0 ? (
        <section>
          <p className="mb-2 rounded-2xl bg-butter p-3 text-sm font-bold text-amber-900">
            いまある材料だけで、ほぼ作れる料理は、ありませんでした。足りないものが少ない順に、近い料理を出しています。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {nearest.map((m) => (
              <RecipeCard key={m.recipe.id} recipe={m.recipe} fridge={{ used: m.used, missing: m.missing }} />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl bg-white p-6 text-center text-stone-600 shadow-pop">
          いまある材料を使う料理が、見つかりませんでした。
        </p>
      )}
    </div>
  );
}
