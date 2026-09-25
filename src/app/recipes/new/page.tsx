"use client";

import { useRouter } from "next/navigation";
import { RecipeForm } from "@/components/RecipeForm";
import { addRecipe } from "@/lib/recipe-store";

export default function NewRecipePage() {
  const router = useRouter();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">レシピを登録</h1>
      <RecipeForm
        submitLabel="登録する"
        onSubmit={(input) => {
          addRecipe(input);
          router.push("/");
        }}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}
