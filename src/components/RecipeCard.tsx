import Link from "next/link";
import { formatMinutes } from "@/lib/cooking-time";
import type { Recipe } from "@/lib/types";
import { RecipePhoto } from "./RecipePhoto";
import { TagChip } from "./TagChip";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:border-orange-300 hover:shadow-sm sm:p-4"
    >
      <RecipePhoto
        path={recipe.photoPath}
        alt={`${recipe.name}の写真`}
        emptyLabel="写真なし"
        className="h-[72px] w-[72px] shrink-0 rounded-md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-500">
          {recipe.category}
          {recipe.cookingMinutes !== undefined && ` ・ 調理 ${formatMinutes(recipe.cookingMinutes)}`}
        </p>
        <h2 className="mt-0.5 break-words font-semibold text-stone-900">{recipe.name}</h2>
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
