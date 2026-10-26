"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { usePlan } from "@/hooks/use-plan";
import { useSynonymIndex } from "@/hooks/use-synonyms";
import { useRecipes } from "@/hooks/use-recipes";
import { covers } from "@/lib/fridge";
import { loadFridge } from "@/lib/fridge-memory";
import { addDays, formatDay, isDateKey, todayKey } from "@/lib/plan";
import { buildShoppingList, describeItem, shoppingToText } from "@/lib/shopping";
import { ShoppingMemo } from "./ShoppingMemo";

const CHECK_KEY = "shopping:checked:v1";
/** 「家にある」にしたもの(買わなくていいもの) */
const HOME_KEY = "shopping:athome:v1";

const GROUP_ICON: Record<string, { icon: string; bg: string }> = {
  "野菜・果物": { icon: "🥬", bg: "bg-mintbg" },
  "肉・魚": { icon: "🍖", bg: "bg-orange-100" },
  "卵・乳製品": { icon: "🥚", bg: "bg-butter" },
  "豆腐・乾物など": { icon: "🫘", bg: "bg-mintbg" },
  "米・麺・パン": { icon: "🍚", bg: "bg-butter" },
  "調味料・油": { icon: "🧂", bg: "bg-orange-100" },
  その他: { icon: "🛒", bg: "bg-stone-100" },
};

/** 買ったもののチェックは、この端末の中だけに覚えておく(期間ごと) */
function readChecked(storageKey: string, rangeKey: string): string[] {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    const v = typeof all === "object" && all !== null ? (all as Record<string, unknown>)[rangeKey] : undefined;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeChecked(storageKey: string, rangeKey: string, keys: string[]) {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    const base = typeof all === "object" && all !== null && !Array.isArray(all) ? (all as Record<string, unknown>) : {};
    // 古い期間の記録が増え続けないよう、最新の20件だけ残す
    const next = { ...base, [rangeKey]: keys };
    const kept = Object.fromEntries(Object.entries(next).slice(-20));
    if (keys.length === 0) delete kept[rangeKey];
    localStorage.setItem(storageKey, JSON.stringify(kept));
  } catch {
    // 覚えておけなくても、画面の操作は続けられる
  }
}

export function ShoppingView() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayKey();
  const qFrom = params.get("from");
  const qTo = params.get("to");
  const from = isDateKey(qFrom) ? qFrom : today;
  const to = isDateKey(qTo) ? qTo : addDays(from, 6);
  // 「選んだ日だけ」で見るとき(とびとびの日でもよい): ?days=2026-10-26,2026-10-28
  const qDays = params.get("days");
  const pickedDays = useMemo(() => {
    if (!qDays) return undefined;
    const ds = [...new Set(qDays.split(",").filter(isDateKey))].sort().slice(0, 100);
    return ds.length > 0 ? ds : undefined;
  }, [qDays]);
  const rangeKey = pickedDays ? `days:${pickedDays.join(",")}` : `${from}_${to}`;

  const { entries } = usePlan();
  const { recipes, ready } = useRecipes();
  const list = useMemo(() => buildShoppingList(entries, recipes, from, to, pickedDays), [entries, recipes, from, to, pickedDays]);
  const synonyms = useSynonymIndex();
  // 冷蔵庫さがしで入れた材料(この端末に覚えてある)
  const [fridge] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadFridge()));


  // チェックは、期間ごとに端末へ保存する。期間が変わったら、その期間の記録を読み直す
  const [checkedState, setCheckedState] = useState<{ range: string; keys: string[] } | null>(null);
  const checked = new Set(checkedState?.range === rangeKey ? checkedState.keys : typeof window === "undefined" ? [] : readChecked(CHECK_KEY, rangeKey));
  // 「家にある」にしたもの(買わなくていい)
  const [homeState, setHomeState] = useState<{ range: string; keys: string[] } | null>(null);
  const atHome = new Set(homeState?.range === rangeKey ? homeState.keys : typeof window === "undefined" ? [] : readChecked(HOME_KEY, rangeKey));
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<"" | "ok" | "ng">("");

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      // 買ったものは、「家にある」からは外す
      if (atHome.has(key)) setHome([...atHome].filter((k) => k !== key));
    }
    const keys = [...next];
    setCheckedState({ range: rangeKey, keys });
    writeChecked(CHECK_KEY, rangeKey, keys);
  }
  function setHome(keys: string[]) {
    setHomeState({ range: rangeKey, keys });
    writeChecked(HOME_KEY, rangeKey, keys);
  }
  /** 「家にある」と「買った」は、同時にはならない(どちらか一方) */
  function toggleHome(key: string) {
    const next = new Set(atHome);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      if (checked.has(key)) {
        const keys = [...checked].filter((k) => k !== key);
        setCheckedState({ range: rangeKey, keys });
        writeChecked(CHECK_KEY, rangeKey, keys);
      }
    }
    setHome([...next]);
  }
  function clearChecks() {
    setCheckedState({ range: rangeKey, keys: [] });
    writeChecked(CHECK_KEY, rangeKey, []);
    setHome([]);
  }
  function setRange(nf: string, nt: string) {
    router.replace(`/plan/shopping?from=${nf}&to=${nt}`);
  }

  async function copy() {
    const text = shoppingToText(list, from, to, checked, atHome, pickedDays?.map(formatDay).join("・"));
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // クリップボードを使えないブラウザ用
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        setCopied(ok ? "ok" : "ng");
      } catch {
        setCopied("ng");
      }
    }
    setTimeout(() => setCopied(""), 3000);
  }

  if (!ready) return <div className="h-40 animate-pulse rounded-2xl bg-orange-100" aria-busy="true" />;

  const allItems = list.groups.flatMap((g) => g.items);
  const total = allItems.length;
  const bought = allItems.filter((i) => checked.has(i.key)).length;
  const home = allItems.filter((i) => atHome.has(i.key)).length;
  const done = bought + home;
  // 冷蔵庫に入れた材料に当たるもの(まだ「買った」「家にある」にしていないもの)
  const fridgeHits = allItems.filter((i) => !checked.has(i.key) && !atHome.has(i.key) && fridge.length > 0 && covers(fridge, i.name, synonyms));
  const valid = pickedDays ? true : from <= to;

  return (
    <div className="space-y-5">
      <Link href="/plan" className="inline-block py-2 text-sm text-stone-500 hover:underline print:hidden sm:py-0">← カレンダーに戻る</Link>
      <h1 className="text-xl font-black">買い物リスト</h1>
      {/* いざという時の「買い忘れメモ」(献立の買い物リストとは、別の枠) */}
      <ShoppingMemo />
      <div className="rounded-3xl bg-gradient-to-br from-amber-200 to-sun p-4 shadow-[0_4px_0_var(--color-sun-d)]">
        <p className="text-xs font-extrabold text-amber-900">買い物の期間</p>
        {pickedDays ? (
          <p className="text-base font-black text-ink">選んだ日: {pickedDays.map(formatDay).join("・")}</p>
        ) : (
          <p className="text-base font-black text-ink">{formatDay(from)} 〜 {formatDay(to)}</p>
        )}
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/70" aria-hidden>
          <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs font-extrabold text-amber-900">そろった {done} / {total}{home > 0 && <span>(うち家にある {home})</span>}</p>
      </div>

      {pickedDays && (
        <p className="print:hidden">
          <Link href="/plan" className="inline-block py-2 text-sm font-bold text-orange-800 underline">日にちを選びなおす(カレンダーへ)</Link>
        </p>
      )}
      {!pickedDays && (
      <section aria-label="期間を変える" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white shadow-pop p-3 print:hidden">
        <label className="text-sm">
          <span className="mb-1 block font-bold text-stone-700">この日から</span>
          <input type="date" value={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} className="rounded-xl border-2 border-line px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-bold text-stone-700">この日まで</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" />
        </label>
      </section>
      )}

      {!valid ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">「この日から」が「この日まで」より後になっています。</p>
      ) : list.dayCount === 0 ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">期間が長すぎます(100日まで)。</p>
      ) : (
        <>
          <p className="text-sm text-stone-600">{list.dayCount}日間の献立 {list.dishCount}品の材料です。</p>
          {list.missing.length > 0 && (
            <p role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              削除されたレシピの献立が{list.missing.length}件あり、材料に入っていません。
            </p>
          )}

          {fridgeHits.length > 0 && (
            <div role="status" className="rounded-2xl bg-mintbg p-3 text-sm text-teal-900 print:hidden">
              <p className="font-bold">
                冷蔵庫に入れた材料に、当たるものが{fridgeHits.length}個あります:
                <span className="ml-1 font-black">{fridgeHits.map((i) => i.name).join("・")}</span>
              </p>
              <button
                type="button"
                onClick={() => setHome([...atHome, ...fridgeHits.map((i) => i.key)])}
                className="mt-2 min-h-[40px] rounded-xl bg-teal-700 px-3 text-sm font-bold text-white hover:bg-teal-800"
              >
                ぜんぶ「家にある」にする
              </button>
              <p className="mt-1 text-xs">いまも、あるかどうかは、冷蔵庫を見て確かめてください。</p>
            </div>
          )}

          {total === 0 ? (
            <div className="rounded-2xl bg-white shadow-pop p-8 text-center">
              <p className="text-stone-600">この期間には、材料のある献立がありません。</p>
              <Link href="/plan" className="mt-3 inline-block text-orange-700 underline">カレンダーで献立を入れる</Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 print:hidden">
                <button type="button" onClick={() => void copy()} className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2 text-sm hover:bg-orange-50">コピー</button>
                <button type="button" onClick={() => window.print()} className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2 text-sm hover:bg-orange-50">印刷</button>
                {done > 0 && <button type="button" onClick={clearChecks} className="py-2 text-sm text-stone-600 underline">チェックを全部外す</button>}
                {copied === "ok" && <span role="status" className="text-sm text-green-700">コピーしました</span>}
                {copied === "ng" && <span role="alert" className="text-sm text-red-700">コピーできませんでした</span>}
              </div>

              {list.groups.map((g) => {
                const look = GROUP_ICON[g.group] ?? GROUP_ICON["その他"];
                return (
                  <section key={g.group} aria-label={g.group}>
                    <h2 className="mb-2 flex items-center gap-2 font-black">
                      <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-lg text-sm ${look.bg}`}>{look.icon}</span>
                      {g.group}
                    </h2>
                    <ul className="space-y-1.5">
                      {g.items.map((it) => {
                        const isHome = atHome.has(it.key);
                        const isOn = checked.has(it.key) || isHome;
                        const id = `item-${it.key}`;
                        return (
                          <li key={it.key} className="rounded-2xl bg-white px-3 py-0.5 shadow-pop-sm">
                            <div className="flex items-center gap-3">
                              <input id={id} type="checkbox" checked={isOn} onChange={() => toggle(it.key)} className="h-6 w-6 shrink-0 accent-[#27c4a0]" />
                              <label htmlFor={id} className={`flex min-w-0 flex-1 cursor-pointer flex-wrap justify-between gap-x-3 py-2.5 font-bold ${isOn ? "text-stone-500 line-through" : ""}`}>
                                <span className="break-words">
                                  {it.name}
                                  {isHome && <span className="ml-1 rounded-full bg-mintbg px-1.5 py-0.5 text-[11px] font-black text-teal-900">家にある</span>}
                                </span>
                                <span className="text-right font-extrabold text-stone-700">{describeItem(it)}</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => toggleHome(it.key)}
                                aria-pressed={isHome}
                                aria-label={`${it.name}は、家にある`}
                                className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold print:hidden ${isHome ? "bg-teal-700 text-white" : "bg-mintbg text-teal-900 hover:bg-teal-100"}`}
                              >
                                家にある
                              </button>
                                <button type="button" onClick={() => setOpen(open === it.key ? null : it.key)} aria-expanded={open === it.key} aria-label={`${it.name}の内訳`} className="px-2 py-2 text-xs font-bold text-orange-700 underline print:hidden">
                                内訳
                              </button>
                            
                            </div>
                            {open === it.key && (
                              <ul className="mb-2 ml-9 space-y-0.5 rounded-xl bg-orange-50 px-3 py-2 text-xs text-stone-700">
                                {it.sources.map((s, i) => (
                                  <li key={i}>{formatDay(s.date)} {s.recipeName}: {s.quantity || "(分量なし)"}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              <p className="text-xs text-stone-500">
                同じ名前・同じ単位の材料だけを足しています(「玉ねぎ」と「たまねぎ」、「大さじ」と「小さじ」は別々に並びます)。「少々」「適量」などは足さず、書いてあるとおりに出します。売り場の分け方は目安です。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
