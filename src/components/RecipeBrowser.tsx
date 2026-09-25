"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRecipes } from "@/hooks/use-recipes";
import { filterRecipes } from "@/lib/filter";
import { RecipeCard } from "./RecipeCard";
import { TagChip } from "./TagChip";

/** 検索・カテゴリー・タグの状態は URL に持つ(詳細から戻っても保たれる) */
export function RecipeBrowser() {
  const { recipes, ready } = useRecipes();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const category = params.get("category") ?? "";
  const tags = useMemo(() => params.getAll("tag"), [params]);
  // 入力欄は IME 変換中の表示を崩さないようローカル state で持ち、URL へ反映する
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(next: { q?: string; category?: string; tags?: string[] }) {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    const nt = next.tags ?? tags;
    if (nq) sp.set("q", nq);
    if (nc) sp.set("category", nc);
    nt.forEach((t) => sp.append("tag", t));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // 実際に使われているカテゴリー・タグだけを絞り込み候補にする
  const usedCategories = useMemo(
    () => [...new Set(recipes.map((r) => r.category))],
    [recipes],
  );
  const usedTags = useMemo(() => {
    const count = new Map<string, number>();
    recipes.forEach((r) => r.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [recipes]);

  const filtered = useMemo(
    () => filterRecipes(recipes, { q, category, tags }),
    [recipes, q, category, tags],
  );

  const hasFilter = q || category || tags.length > 0;

  if (!ready) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-stone-200" />
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-stone-600">まだレシピがありません。</p>
        <Link
          href="/recipes/new"
          className="mt-3 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          最初のレシピを登録する
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          update({ q: e.target.value });
        }}
        placeholder="料理名・タグで検索"
        aria-label="料理名・タグで検索"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-orange-500"
      />

      <div className="space-y-3">
        {/* スマホではラベルを上、チップを下に縦積みし、折り返してもラベル列とずれないようにする */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
          <span className="shrink-0 text-sm text-stone-500 sm:w-20 sm:leading-[26px]">
            カテゴリー
          </span>
          <div className="flex flex-wrap gap-2">
            {usedCategories.map((c) => (
              <TagChip
                key={c}
                label={c}
                selected={category === c}
                onClick={() => update({ category: category === c ? "" : c })}
              />
            ))}
          </div>
        </div>
        {usedTags.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
            <span className="shrink-0 text-sm text-stone-500 sm:w-20 sm:leading-[26px]">
              用途タグ
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {usedTags.map((t) => (
                <TagChip
                  key={t}
                  label={t}
                  selected={tags.includes(t)}
                  onClick={() =>
                    update({
                      tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t],
                    })
                  }
                />
              ))}
              {tags.length > 1 && (
                <span className="text-xs text-stone-500">(すべて含むレシピ)</span>
              )}
            </div>
          </div>
        )}
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.replace(pathname, { scroll: false });
            }}
            className="py-2 text-sm text-orange-700 underline sm:py-0"
          >
            絞り込みをクリア
          </button>
        )}
      </div>

      <p className="text-sm text-stone-500">{filtered.length}件</p>
      {filtered.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-stone-600">
          条件に合うレシピがありません。
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
