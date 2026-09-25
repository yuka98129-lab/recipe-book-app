"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RecipeForm } from "@/components/RecipeForm";
import { TagChip } from "@/components/TagChip";
import { useRecipes } from "@/hooks/use-recipes";
import { deleteRecipe, updateRecipe } from "@/lib/recipe-store";
import type { Ingredient } from "@/lib/types";

function IngredientSection({ title, items }: { title: string; items: Ingredient[] }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {items.map((ing, i) => (
          <li key={i} className="flex justify-between gap-4 px-4 py-2">
            <span className="min-w-0 break-words">{ing.name}</span>
            <span className="shrink-0 text-right text-stone-600">{ing.quantity}</span>
          </li>
        ))}
      </ul>
    </section>
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
    return <div className="h-40 animate-pulse rounded-lg bg-stone-200" aria-busy="true" />;
  }

  if (!recipe) {
    return (
      <div className="rounded-lg bg-white p-8 text-center">
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
        <h1 className="mb-6 text-xl font-bold">レシピを編集</h1>
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

  return (
    <article className="space-y-6">
      <Link href="/" className="inline-block py-2 text-sm text-stone-500 hover:underline sm:py-0">
        ← 一覧に戻る
      </Link>

      <header>
        <p className="text-sm text-stone-500">{recipe.category}</p>
        <h1 className="mt-1 break-words text-xl font-bold sm:text-2xl">{recipe.name}</h1>
        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        )}
      </header>

      <IngredientSection title="材料" items={recipe.ingredients} />
      {/* 調味料が未入力のレシピでは、空の見出しを出さない */}
      {recipe.seasonings.length > 0 && (
        <IngredientSection title="調味料" items={recipe.seasonings} />
      )}

      <section>
        <h2 className="mb-2 font-semibold">手順</h2>
        <ol className="space-y-3">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm text-white">
                {i + 1}
              </span>
              <p className="whitespace-pre-wrap">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`rounded-md border border-stone-300 bg-white px-4 py-2 hover:bg-stone-50 ${
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
                deleteRecipe(recipe.id);
                router.push("/");
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 hover:bg-stone-50"
            >
              やめる
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-red-700 hover:bg-red-50"
          >
            削除
          </button>
        )}
      </div>
    </article>
  );
}
