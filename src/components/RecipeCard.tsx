import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { TagChip } from "./TagChip";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-orange-300 hover:shadow-sm"
    >
      <p className="text-xs text-stone-500">{recipe.category}</p>
      <h2 className="mt-0.5 font-semibold text-stone-900">{recipe.name}</h2>
      {recipe.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.tags.map((t) => (
            <TagChip key={t} label={t} />
          ))}
        </div>
      )}
    </Link>
  );
}
