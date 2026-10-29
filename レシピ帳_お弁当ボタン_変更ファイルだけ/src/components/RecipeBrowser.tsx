"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRecipes } from "@/hooks/use-recipes";
import { useSync } from "@/hooks/use-sync";
import { useSynonymIndex } from "@/hooks/use-synonyms";
import { filterRecipes, ingredientHits } from "@/lib/filter";
import { parseScene, SCENES, type Scene } from "@/lib/scene";
import { GYOU, groupByGyou, needsReading, OTHER } from "@/lib/reading";
import { fillMissingReadings } from "@/lib/reading-client";
import { FridgeFinder } from "./FridgeFinder";
import { RecipeCard } from "./RecipeCard";
import { TagChip } from "./TagChip";

/** 検索・カテゴリー・タグの状態は URL に持つ(詳細から戻っても保たれる) */
export function RecipeBrowser() {
  const { recipes, ready } = useRecipes();
  const synonyms = useSynonymIndex();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const category = params.get("category") ?? "";
  const scene = parseScene(params.get("scene"));
  const tags = useMemo(() => params.getAll("tag"), [params]);
  // 「冷蔵庫の材料から探す」モード(いまある材料も URL に持つ)
  const fridgeOn = params.get("fridge") === "1";
  const have = useMemo(() => params.getAll("have"), [params]);
  // 入力欄は IME 変換中の表示を崩さないようローカル state で持ち、URL へ反映する
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(next: { q?: string; category?: string; scene?: Scene; tags?: string[]; fridge?: boolean; have?: string[] }) {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    const ns = next.scene ?? scene;
    const nt = next.tags ?? tags;
    const nf = next.fridge ?? fridgeOn;
    const nh = next.have ?? have;
    if (nq) sp.set("q", nq);
    if (nc) sp.set("category", nc);
    if (ns) sp.set("scene", ns);
    nt.forEach((t) => sp.append("tag", t));
    if (nf) {
      sp.set("fridge", "1");
      nh.forEach((h) => sp.append("have", h));
    }
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

  // (React Compiler がまとめて覚えるので、ここは useMemo にしない)
  const filtered = filterRecipes(recipes, { q, category, tags, scene }, synonyms);

  // 冷蔵庫さがしは、カテゴリー・タグで絞った料理の中から探す
  const fridgeRecipes = fridgeOn ? filterRecipes(recipes, { q: "", category, tags, scene }) : [];

  const hasFilter = q || category || scene || tags.length > 0;

  // あいうえお順に、あ行・か行…でまとめる
  const groups = groupByGyou(filtered);
  const present = new Set<string>(groups.map((g) => g.gyou));

  // よみがながなくて(漢字まじりの名前)、「その他」に入っている料理
  const missing = recipes.filter(needsReading).length;
  const sync = useSync();
  const signedIn = sync.status === "idle" || sync.status === "syncing" || sync.status === "error";
  const [filling, setFilling] = useState<{ done: number; total: number } | null>(null);
  const [fillMsg, setFillMsg] = useState("");

  async function fillAll() {
    setFilling({ done: 0, total: missing });
    setFillMsg("");
    try {
      const n = await fillMissingReadings(recipes, (done, total) => setFilling({ done, total }));
      setFillMsg(n > 0 ? `${n}件に、よみがなを入れました。まちがいは、レシピの編集画面で直せます。` : "よみがなを付けられませんでした。時間をおいて、もう一度試してください。");
    } catch (err) {
      setFillMsg(err instanceof Error ? err.message : "よみがなを入れられませんでした。");
    } finally {
      setFilling(null);
    }
  }

  function setFridge(on: boolean) {
    update({ fridge: on });
  }

  function jump(gyou: string) {
    const el = document.getElementById(`gyou-${gyou}`);
    if (!el) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }

  if (!ready) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-orange-100" />
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-white p-10 text-center">
        <p className="text-stone-600">まだレシピがありません。</p>
        <Link
          href="/recipes/new"
          className="mt-3 inline-block btn-pop rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
        >
          最初のレシピを登録する
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div role="group" aria-label="さがし方" className="flex gap-2">
        {[
          { on: false, label: "名前・材料で探す" },
          { on: true, label: "冷蔵庫の材料から探す" },
        ].map((m) => (
          <button
            key={m.label}
            type="button"
            aria-pressed={fridgeOn === m.on}
            onClick={() => setFridge(m.on)}
            className={`min-h-[44px] flex-1 rounded-full border-2 px-2 text-sm font-black ${
              fridgeOn === m.on ? "border-orange-600 bg-orange-600 text-white" : "border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!fridgeOn && (
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-5 w-5">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            update({ q: e.target.value });
          }}
          placeholder="料理名・材料・タグで検索"
          aria-label="料理名・材料・タグで検索"
          className="w-full rounded-full border-2 border-line bg-white py-2.5 pl-11 pr-4 shadow-pop-sm outline-none focus:border-orange-500"
        />
      </div>
      )}

      {!fridgeOn && (
      <p className="-mt-3 text-xs text-stone-600">
        例: 「白滝 キャベツ」のように、スペースで区切ると、すべてを使う料理が出ます(料理名・材料・タグが対象)。
      </p>
      )}

      {!fridgeOn && missing > 0 && (
        <div className="rounded-2xl bg-butter p-3 text-sm text-amber-900">
          <p className="font-bold">よみがなが、まだない料理が{missing}件あります。</p>
          <p className="mt-0.5 text-xs">あいうえお順では、「{OTHER}」に入っています。</p>
          {signedIn ? (
            <button
              type="button"
              onClick={fillAll}
              disabled={filling !== null}
              className="btn-pop mt-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {filling ? `入れています… ${filling.done}/${filling.total}` : "AIでまとめて入れる"}
            </button>
          ) : (
            <p className="mt-1 text-xs">ログインすると、AIでまとめて入れられます。1件ずつは、レシピの編集画面で、自分で入れられます。</p>
          )}
          {fillMsg && <p className="mt-2 text-xs font-bold">{fillMsg}</p>}
        </div>
      )}

      <div role="group" aria-label="場面" className="flex gap-2" data-testid="scene-filter">
        {SCENES.map((s) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={scene === s.id}
            onClick={() => update({ scene: s.id })}
            className={`min-h-[44px] ${s.id === "" ? "flex-[0.7]" : "flex-1"} whitespace-nowrap rounded-full border-2 px-2 text-[13px] font-black sm:text-sm ${
              scene === s.id ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-800 hover:bg-teal-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {/* スマホではラベルを上、チップを下に縦積みし、折り返してもラベル列とずれないようにする */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
          <span className="shrink-0 text-sm font-bold text-stone-600 sm:w-20 sm:leading-[26px]">
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
            <span className="shrink-0 text-sm font-bold text-stone-600 sm:w-20 sm:leading-[26px]">
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
              update({ q: "", category: "", scene: "", tags: [] });
            }}
            className="py-2 text-sm text-orange-700 underline sm:py-0"
          >
            絞り込みをクリア
          </button>
        )}
      </div>

      {fridgeOn ? (
        <FridgeFinder recipes={fridgeRecipes} have={have} onChange={(h) => update({ have: h })} />
      ) : (
        <>
      <p className="text-sm font-bold text-stone-600">{filtered.length}件</p>
      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-white shadow-pop p-6 text-center text-stone-600">
          条件に合うレシピがありません。
        </p>
      ) : (
        <>
          <nav
            aria-label="あいうえお順のジャンプ"
            className="sticky top-0 z-20 -mx-4 flex justify-between gap-1 bg-cream/95 px-3 py-2 backdrop-blur"
            style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
          >
            {[...GYOU, OTHER].map((g) => (
              <button
                key={g}
                type="button"
                disabled={!present.has(g)}
                onClick={() => jump(g)}
                aria-label={`${g}へ`}
                className="min-h-[40px] min-w-0 flex-1 rounded-full border-2 border-orange-200 bg-white px-0 text-sm font-black text-orange-700 hover:bg-orange-50 disabled:border-transparent disabled:bg-transparent disabled:text-stone-300"
              >
                {g === OTHER ? "他" : g[0]}
              </button>
            ))}
          </nav>
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.gyou} id={`gyou-${g.gyou}`} className="scroll-mt-16">
                <h2 className="mb-2 flex items-center gap-2 text-base font-black text-orange-700">
                  <span className="rounded-full bg-orange-100 px-3 py-0.5">{g.gyou}</span>
                  <span className="text-xs font-bold text-stone-500">{g.recipes.length}件</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.recipes.map((r) => (
                    <RecipeCard key={r.id} recipe={r} hits={ingredientHits(r, q, synonyms)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
