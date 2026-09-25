export type Ingredient = { name: string; quantity: string };

/**
 * 「トッピング」など、ユーザーが名前を付けて追加する材料グループ。
 * レシピの「カテゴリー」(主菜・副菜など)とは別のもの。
 */
export type IngredientGroup = { name: string; items: Ingredient[] };

export type Recipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  /** 調味料。後から追加した項目のため、保存済みの古いレシピには無い(読み込み時に [] で補う) */
  seasonings: Ingredient[];
  /** ユーザーが追加したグループ。後から追加した項目のため、古いレシピには無い(読み込み時に [] で補う) */
  extraGroups: IngredientGroup[];
  steps: string[];
  createdAt: number;
};

export type RecipeInput = Omit<Recipe, "id" | "createdAt">;
