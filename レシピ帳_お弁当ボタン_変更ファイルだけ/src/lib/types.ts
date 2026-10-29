import type { NutritionEstimate } from "./nutrition";
import type { Bento } from "./scene";

export type Ingredient = { name: string; quantity: string };

/**
 * 「トッピング」など、ユーザーが名前を付けて追加する材料グループ。
 * レシピの「カテゴリー」(主菜・副菜など)とは別のもの。
 */
export type IngredientGroup = { name: string; items: Ingredient[] };

export type Recipe = {
  id: string;
  name: string;
  /** 料理名のよみがな(ひらがな)。あいうえお順に並べるために使う。任意。後から追加した項目のため、無いレシピが多い */
  reading?: string;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  /** 調味料。後から追加した項目のため、保存済みの古いレシピには無い(読み込み時に [] で補う) */
  seasonings: Ingredient[];
  /** ユーザーが追加したグループ。後から追加した項目のため、古いレシピには無い(読み込み時に [] で補う) */
  extraGroups: IngredientGroup[];
  steps: string[];
  /** 料理の写真(Supabase Storage 内のパス)。1レシピに1枚。ログイン中だけ使える。無いレシピが多い */
  photoPath?: string;
  /** 調理時間(分、1〜1440の整数)。任意。後から追加した項目のため、無いレシピが多い */
  cookingMinutes?: number;
  /** お弁当との関係。無ければ、ふだんのおかず用。"both" = お弁当にも使える、"only" = お弁当用。後から追加した項目のため、無いレシピが多い */
  bento?: Bento;
  /** 何人分の材料か(1〜100の整数)。任意。後から追加した項目のため、無いレシピが多い */
  servings?: number;
  /** 栄養素の推定(AIによる目安)。任意。材料を直したあとは古くなるため、basis で見分ける */
  nutrition?: NutritionEstimate;
  createdAt: number;
};

export type RecipeInput = Omit<Recipe, "id" | "createdAt">;
