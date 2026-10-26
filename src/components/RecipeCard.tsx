import Link from "next/link";
import { formatMinutes } from "@/lib/cooking-time";
import { formatServings } from "@/lib/servings";
import type { Recipe } from "@/lib/types";
import { RecipePhoto } from "./RecipePhoto";
import { TagChip } from "./TagChip";

/** hits: 検索で、材料の名前に当たったもの(あれば「材料: …」と出す)。fridge: 冷蔵庫さがしの結果(使える材料・足りない材料) */
export function RecipeCard({ recipe, hits = [], fridge }: { recipe: Recipe; hits?: string[]; fridge?: { used: string[]; missing: string[] } }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex gap-3 rounded-3xl bg-white p-3 shadow-pop hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--color-line)] sm:p-4"
    >
      <RecipePhoto
        path={recipe.photoPath}
        alt={`${recipe.name}の写真`}
        emptyLabel="写真なし"
        seed={recipe.id}
        className="h-[72px] w-[72px] shrink-0 rounded-2xl"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-stone-600">
          {recipe.category}
          {recipe.cookingMinutes !== undefined && ` ・ 調理 ${formatMinutes(recipe.cookingMinutes)}`}
          {recipe.servings !== undefined && ` ・ ${formatServings(recipe.servings)}`}
        </p>
        <h3 className="mt-0.5 break-words font-black text-ink">{recipe.name}</h3>
        {hits.length > 0 && (
          <p className="mt-1 break-words text-xs font-bold text-teal-800">
            <span className="mr-1 rounded-full bg-mintbg px-2 py-0.5">材料</span>
            {hits.slice(0, 4).join("・")}
            {hits.length > 4 && ` ほか${hits.length - 4}`}
          </p>
        )}
        {fridge && (
          <div className="mt-1.5 space-y-1 text-xs font-bold">
            {fridge.missing.length === 0 ? (
              <p className="inline-block rounded-full bg-mintbg px-2.5 py-0.5 text-teal-900">ぜんぶそろっています</p>
            ) : (
              <p className="break-words rounded-xl bg-butter px-2.5 py-1 text-amber-900">
                あと<span className="mx-1 text-sm font-black">{fridge.missing.join("・")}</span>
                {fridge.missing.length === 1 ? "だけあれば作れます" : "があれば作れます"}
              </p>
            )}
            <p className="break-words text-stone-600">いまある: {fridge.used.join("・")}</p>
          </div>
        )}
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
