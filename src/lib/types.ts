export type Ingredient = { name: string; quantity: string };

export type Recipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  createdAt: number;
};

export type RecipeInput = Omit<Recipe, "id" | "createdAt">;
