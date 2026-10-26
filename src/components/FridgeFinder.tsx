"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useSynonymIndex } from "@/hooks/use-synonyms";
import { findByFridge, nearestByFridge, popularIngredients, splitHave } from "@/lib/fridge";
import { saveFridge } from "@/lib/fridge-memory";
import { addExtras, getExtrasSnapshot, getServerExtrasSnapshot, subscribeExtras } from "@/lib/shopping-extras";
import { substitutesForMissing } from "@/lib/substitutes";
import type { Recipe } from "@/lib/types";
import type { FridgeMatch } from "@/lib/fridge";
import { FridgePhotoReader } from "./FridgePhotoReader";
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
export function FridgeFinder({ recipes, have, onChange: onChangeRaw }: Props) {
  // 入れた材料は、この端末に覚えておく(買い物リストで、冷蔵庫にあるものを見分けるため)
  const onChange = (next: string[]) => {
    saveFridge(next);
    onChangeRaw(next);
  };
  const extras = useSyncExternalStore(subscribeExtras, getExtrasSnapshot, getServerExtrasSnapshot);
  const [text, setText] = useState("");
  const [withSeasonings, setWithSeasonings] = useState(false);
  const synonyms = useSynonymIndex();

  const add = (items: string[]) => onChange(splitHave([...have, ...items].join(" ")));
  const commit = () => {
    if (text.trim()) add([text]);
    setText("");
  };

  const suggestions = useMemo(() => popularIngredients(recipes, have, 12, synonyms), [recipes, have, synonyms]);
  const matches = useMemo(() => findByFridge(recipes, have, { includeSeasonings: withSeasonings, synonyms }), [recipes, have, withSeasonings, synonyms]);
  const nearest = useMemo(
    () => (have.length > 0 && matches.length === 0 ? nearestByFridge(recipes, have, 5, { includeSeasonings: withSeasonings, synonyms }) : []),
    [recipes, have, withSeasonings, matches.length, synonyms],
  );

  // 足りない材料のうち、手持ちで代用できるものを、カードに添える
  const fridgeOf = (m: FridgeMatch) => ({ used: m.used, missing: m.missing, subs: substitutesForMissing(m.recipe, m.missing, have, synonyms) });

  const card = (m: FridgeMatch) => {
    const inList = m.missing.length > 0 && m.missing.every((n) => extras.some((x) => x.name === n && !x.done));
    return (
      <div key={m.recipe.id}>
        <RecipeCard recipe={m.recipe} fridge={fridgeOf(m)} />
        {m.missing.length > 0 && (
          <button
            type="button"
            disabled={inList}
            onClick={() => addExtras(m.missing)}
            className="mt-1 min-h-[40px] w-full rounded-xl border-2 border-line bg-white px-3 text-xs font-bold text-orange-800 shadow-pop-sm hover:bg-orange-50 disabled:text-teal-800 disabled:shadow-none"
          >
            {inList ? "買い忘れメモに入れました ✓" : `足りない材料(${m.missing.join("・")})を、買い忘れメモに入れる`}
          </button>
        )}
      </div>
    );
  };

  const sections = [0, 1, 2].map((n) => ({ n, items: matches.filter((m) => m.missing.length === n) })).filter((s) => s.items.length > 0);
  const title = (n: number) => (n === 0 ? "いま作れる(材料がぜんぶそろっています)" : `あと${n}つで作れる`);

  return (
    <div className="space-y-4">
      <FridgePhotoReader onAdd={add} />
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
              {s.items.map(card)}
            </div>
          </section>
        ))
      ) : nearest.length > 0 ? (
        <section>
          <p className="mb-2 rounded-2xl bg-butter p-3 text-sm font-bold text-amber-900">
            いまある材料だけで、ほぼ作れる料理は、ありませんでした。足りないものが少ない順に、近い料理を出しています。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {nearest.map(card)}
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
