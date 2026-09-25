export type Ingredient = { name: string; quantity: string };

export type Recipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  /** 調味料。後から追加した項目のため、保存済みの古いレシピには無い(読み込み時に [] で補う) */
  seasonings: Ingredient[];
  steps: string[];
  createdAt: number;
};

export type RecipeInput = Omit<Recipe, "id" | "createdAt">;
