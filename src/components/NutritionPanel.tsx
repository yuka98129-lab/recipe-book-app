"use client";

import { useState } from "react";
import { useSync } from "@/hooks/use-sync";
import {
  formatAmount,
  isNutritionCurrent,
  NUTRIENTS,
  perServing,
  pfcShare,
  totalNutrition,
  vegetableGrams,
} from "@/lib/nutrition";
import { requestNutrition } from "@/lib/nutrition-client";
import { setNutrition } from "@/lib/recipe-store";
import type { Recipe } from "@/lib/types";

const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

/** レシピ詳細の「栄養素(AIの推定)」。材料と分量から推定し、レシピ全体の合計(と、人数があれば1人分)を表示する */
export function NutritionPanel({ recipe }: { recipe: Recipe }) {
  const sync = useSync();
  const signedIn = sync.status === "idle" || sync.status === "syncing" || sync.status === "error";
  const [usePhoto, setUsePhoto] = useState(Boolean(recipe.photoPath));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showItems, setShowItems] = useState(false);

  const est = recipe.nutrition;

  async function run() {
    setBusy(true);
    setError("");
    try {
      setNutrition(recipe.id, await requestNutrition(recipe, usePhoto));
    } catch (err) {
      setError(err instanceof Error ? err.message : "推定に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const total = est ? totalNutrition(est.items) : null;
  const each = total && recipe.servings ? perServing(total, recipe.servings) : null;
  const veg = est ? vegetableGrams(est.items) : 0;
  const pfc = total ? pfcShare(total) : null;

  return (
    <section aria-labelledby="nutrition-heading">
      <h2 id="nutrition-heading" className="mb-2 flex items-center gap-2 font-black">
        <i aria-hidden className="block h-4 w-2 rounded bg-mint" />
        栄養素<span className="rounded-full bg-butter px-2 py-0.5 text-[11px] font-extrabold text-amber-900">AIの推定</span>
      </h2>

      {est && total && (
        <div className="space-y-3">
          {!isNutritionCurrent(recipe, est) && (
            <p role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              材料が変わったので、この数字は古いままです。「もう一度推定する」を押してください。
            </p>
          )}

          {pfc && (
            <div className="rounded-2xl bg-white p-3 shadow-pop-sm">
              <p className="mb-1.5 text-xs font-extrabold text-stone-700">PFCバランス(エネルギーの割合)</p>
              <div
                role="img"
                aria-label={`たんぱく質${pfc.p}%、脂質${pfc.f}%、炭水化物${pfc.c}%`}
                className="flex h-3.5 overflow-hidden rounded-full bg-orange-50"
              >
                <div className="bg-sun" style={{ width: `${pfc.p}%` }} />
                <div className="bg-orange-400" style={{ width: `${pfc.f}%` }} />
                <div className="bg-mint" style={{ width: `${pfc.c}%` }} />
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs font-bold text-stone-700">
                <span><i aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-sun" />たんぱく質 {pfc.p}%</span>
                <span><i aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />脂質 {pfc.f}%</span>
                <span><i aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-mint" />炭水化物 {pfc.c}%</span>
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl bg-white shadow-pop">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line bg-orange-50 text-stone-700">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {" "}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">レシピ全体</th>
                  {each && <th scope="col" className="px-3 py-2 text-right font-medium">1人分({recipe.servings}人分で割る)</th>}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-dashed divide-line">
                {NUTRIENTS.map((n) => (
                  <tr key={n.key}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">{n.label}</th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAmount(total[n.key], n.digits)} <span className="text-xs text-stone-500">{n.unit}</span>
                    </td>
                    {each && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatAmount(each[n.key], n.digits)} <span className="text-xs text-stone-500">{n.unit}</span>
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="bg-mintbg">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    野菜の量
                    <span className="block text-xs text-stone-500">いも・きのこ・海藻・豆・果物は含みません</span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAmount(veg, 0)} <span className="text-xs text-stone-500">g</span>
                  </td>
                  {each && recipe.servings && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatAmount(veg / recipe.servings, 0)} <span className="text-xs text-stone-500">g</span>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {!each && (
            <p className="text-xs text-stone-500">
              「編集」で「何人分の材料ですか」を入れると、1人分の数字も出ます。
            </p>
          )}

          <p className="text-xs text-stone-600">
            {fmtDate(est.estimatedAt)}に推定{est.usedPhoto ? "(完成写真も参考にしました)" : ""}。食品成分表をもとにAIが計算した目安で、実際の値とは違います。
            医療や食事指導の数字としては使わないでください。
          </p>

          {est.assumptions.length > 0 && (
            <div className="rounded-2xl bg-butter px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">推定のときの仮定・自信がない所</p>
              <ul className="list-disc pl-5">
                {est.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowItems(!showItems)}
              aria-expanded={showItems}
              className="py-2 text-sm font-bold text-orange-700 underline sm:py-0"
            >
              {showItems ? "材料ごとの内訳を閉じる" : "材料ごとの内訳を見る"}
            </button>
            {showItems && (
              <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-pop">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-line bg-orange-50 text-stone-700">
                      <th scope="col" className="px-2 py-1.5 text-left font-medium">材料</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">重さ</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">kcal</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">たんぱく質</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">脂質</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">炭水化物</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-dashed divide-line">
                    {est.items.map((it, i) => (
                      <tr key={i}>
                        <th scope="row" className="px-2 py-1.5 text-left font-normal">
                          {it.name}
                          {it.isVegetable && <span className="ml-1 text-green-700">(野菜)</span>}
                          {it.note && <span className="block text-stone-500">{it.note}</span>}
                        </th>
                        <td className="px-2 py-1.5 text-right tabular-nums">{it.grams === null ? "-" : `${formatAmount(it.grams, 0)}g`}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatAmount(it.values.energyKcal, 0)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatAmount(it.values.proteinG, 1)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatAmount(it.values.fatG, 1)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatAmount(it.values.carbG, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!signedIn ? (
        <p className="rounded-xl border-2 border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          栄養素の推定は、ログインしているときに使えます。「設定」の「ほかの端末と同期する」で、ログインしてください。
        </p>
      ) : (
        <div className={est ? "mt-3 space-y-2" : "space-y-2"}>
          {!est && (
            <p className="text-sm text-stone-600">
              材料と分量から、栄養素(エネルギー・たんぱく質・脂質・炭水化物・ビタミン・ミネラル・野菜の量)を、AIがおおまかに計算します。
            </p>
          )}
          {recipe.photoPath && (
            <label className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} disabled={busy} className="h-4 w-4" />
              完成写真も参考にする
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="btn-pop rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:py-2"
            >
              {busy ? "推定しています…(10〜30秒ほど)" : est ? "もう一度推定する" : "栄養素を推定する"}
            </button>
            {est && !busy && (
              <button
                type="button"
                onClick={() => setNutrition(recipe.id, undefined)}
                className="py-2 text-sm text-red-700 underline sm:py-0"
              >
                推定を消す
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
