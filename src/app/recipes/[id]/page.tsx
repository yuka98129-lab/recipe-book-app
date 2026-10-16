"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { NutritionPanel } from "@/components/NutritionPanel";
import { RecipeForm } from "@/components/RecipeForm";
import { RecipePhoto } from "@/components/RecipePhoto";
import { TagChip } from "@/components/TagChip";
import { useRecipes } from "@/hooks/use-recipes";
import { formatMinutes } from "@/lib/cooking-time";
import { vegetableGrams } from "@/lib/nutrition";
import { formatServings } from "@/lib/servings";
import { removePhoto } from "@/lib/photo";
import { deleteRecipe, updateRecipe } from "@/lib/recipe-store";
import type { Ingredient } from "@/lib/types";

/** 見出し(左に色つきの縦線) */
function SectionTitle({ children, color = "bg-sun" }: { children: React.ReactNode; color?: string }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 font-black">
      <i aria-hidden className={`block h-4 w-2 rounded ${color}`} />
      {children}
    </h2>
  );
}

function IngredientSection({ title, items }: { title: string; items: Ingredient[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <ul className="divide-y-2 divide-dashed divide-line rounded-2xl bg-white shadow-pop">
        {items.map((ing, i) => (
          <li key={i} className="flex justify-between gap-4 px-4 py-2">
            <span className="min-w-0 break-words">{ing.name}</span>
            <span className="shrink-0 text-right font-bold text-stone-700">{ing.quantity}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InfoCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-white px-2 py-2 text-center shadow-pop-sm">
      <p className="text-[11px] font-bold text-stone-600">{label}</p>
      <p className={`break-words text-base font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { recipes, ready } = useRecipes();
  // 編集は別ルートにせず、この画面内で切り替える(画面遷移は最大2階層)
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const recipe = recipes.find((r) => r.id === id);

  if (!ready) {
    return <div className="h-40 animate-pulse rounded-2xl bg-orange-100" aria-busy="true" />;
  }

  if (!recipe) {
    return (
      <div className="rounded-2xl bg-white shadow-pop p-8 text-center">
        <p className="text-stone-600">レシピが見つかりませんでした。</p>
        <Link href="/" className="mt-3 inline-block text-orange-700 underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-black">レシピを編集</h1>
        <RecipeForm
          initial={recipe}
          submitLabel="保存する"
          onSubmit={(input) => {
            updateRecipe(recipe.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // 野菜の量(栄養素を推定してあるときだけ)。人数があれば1人分
  const vegetablePerPerson = recipe.nutrition
    ? vegetableGrams(recipe.nutrition.items) / (recipe.servings ?? 1)
    : null;

  return (
    <article className="space-y-6">
      <Link href="/" className="inline-block py-2 text-sm font-bold text-stone-600 hover:underline sm:py-0">
        ← 一覧に戻る
      </Link>

      {recipe.photoPath ? (
        <RecipePhoto
          path={recipe.photoPath}
          alt={`${recipe.name}の写真`}
          className="h-56 w-full rounded-3xl sm:h-72"
        />
      ) : null}

      <header>
        <p className="text-sm font-bold text-stone-600">{recipe.category}</p>
        <h1 className="mt-1 break-words text-xl font-black sm:text-2xl">{recipe.name}</h1>
        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        )}
        {(recipe.cookingMinutes !== undefined || recipe.servings !== undefined || vegetablePerPerson !== null) && (
          <div className="mt-4 flex gap-2">
            {recipe.cookingMinutes !== undefined && (
              <InfoCard label="調理時間" value={formatMinutes(recipe.cookingMinutes)} />
            )}
            {recipe.servings !== undefined && <InfoCard label="材料" value={formatServings(recipe.servings)} />}
            {vegetablePerPerson !== null && (
              <InfoCard
                label={recipe.servings !== undefined ? "野菜(1人分)" : "野菜(全体)"}
                value={`${Math.round(vegetablePerPerson)}g`}
                valueClass="text-mint-d"
              />
            )}
          </div>
        )}
      </header>

      <IngredientSection title="材料" items={recipe.ingredients} />
      {/* 調味料が未入力のレシピでは、空の見出しを出さない */}
      {recipe.seasonings.length > 0 && (
        <IngredientSection title="調味料" items={recipe.seasonings} />
      )}
      {/* ユーザーが追加したグループ(トッピングなど)。グループ名を見出しにする */}
      {recipe.extraGroups.map((group, i) => (
        <IngredientSection key={i} title={group.name} items={group.items} />
      ))}

      <section>
        <SectionTitle color="bg-mint">手順</SectionTitle>
        <ol className="space-y-3">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-black text-white shadow-[0_2px_0_var(--color-orange-900)]">
                {i + 1}
              </span>
              <p className="whitespace-pre-wrap">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <NutritionPanel recipe={recipe} />

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2 hover:bg-orange-50 ${
            confirmingDelete ? "hidden sm:block" : ""
          }`}
        >
          編集
        </button>
        {confirmingDelete ? (
          <>
            <span className="w-full text-sm text-red-700 sm:w-auto">
              このレシピを削除しますか?
            </span>
            <button
              type="button"
              onClick={() => {
                // 写真も、クラウドから消す(失敗してもレシピの削除は進める)
                if (recipe.photoPath) void removePhoto(recipe.photoPath);
                deleteRecipe(recipe.id);
                router.push("/");
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2 hover:bg-orange-50"
            >
              やめる
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-xl border-2 border-red-300 bg-white px-4 py-2 text-red-700 hover:bg-red-50"
          >
            削除
          </button>
        )}
      </div>
    </article>
  );
}
