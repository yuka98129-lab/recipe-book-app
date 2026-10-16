import Link from "next/link";
import { formatMinutes } from "@/lib/cooking-time";
import { formatServings } from "@/lib/servings";
import type { Recipe } from "@/lib/types";
import { RecipePhoto } from "./RecipePhoto";
import { TagChip } from "./TagChip";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
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
        <h2 className="mt-0.5 break-words font-black text-ink">{recipe.name}</h2>
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
