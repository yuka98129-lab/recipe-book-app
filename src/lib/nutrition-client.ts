import { nutritionBasis, parseAssumptions, parseNutritionItems, type NutritionEstimate } from "./nutrition";
import { PHOTO_BUCKET } from "./photo-path";
import { imageToReadDataUrl, ReadRequestError } from "./recipe-reader-client";
import { getSupabase } from "./supabase";
import type { Recipe } from "./types";

// ブラウザ側:レシピの材料(と、あれば完成写真)をサーバー(/api/estimate-nutrition)へ送り、推定を受け取る。

/** 保存してある完成写真を取り出して、読み取り用の大きさの data URL にする */
async function loadPhotoDataUrl(path: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new ReadRequestError("写真を読み込めませんでした。");
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new ReadRequestError("写真を読み込めませんでした。写真なしで推定するか、少し待ってからもう一度試してください。");
  return imageToReadDataUrl(new File([data], "photo.jpg", { type: "image/jpeg" }));
}

export async function requestNutrition(recipe: Recipe, usePhoto: boolean): Promise<NutritionEstimate> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new ReadRequestError("推定は、ログインしているときに使えます。");

  const withPhoto = usePhoto && Boolean(recipe.photoPath);
  const image = withPhoto && recipe.photoPath ? await loadPhotoDataUrl(recipe.photoPath) : null;

  const groups = [
    { title: "材料", rows: recipe.ingredients },
    { title: "調味料", rows: recipe.seasonings },
    ...recipe.extraGroups.map((g) => ({ title: g.name || "追加グループ", rows: g.items })),
  ];

  let res: Response;
  try {
    res = await fetch("/api/estimate-nutrition", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: recipe.name, groups, image }),
    });
  } catch {
    throw new ReadRequestError("通信できませんでした。ネットワークを確認して、もう一度試してください。");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "推定に失敗しました。";
    throw new ReadRequestError(message);
  }
  const b = (body ?? {}) as { items?: unknown; assumptions?: unknown };
  const items = parseNutritionItems(b.items);
  if (items.length === 0) throw new ReadRequestError("栄養素を推定できませんでした。もう一度試してください。");
  return {
    items,
    assumptions: parseAssumptions(b.assumptions),
    basis: nutritionBasis(recipe),
    usedPhoto: withPhoto,
    estimatedAt: Date.now(),
  };
}
