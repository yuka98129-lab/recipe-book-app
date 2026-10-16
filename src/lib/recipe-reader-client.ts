import { getSupabase } from "./supabase";
import { READ_IMAGE_OPTIONS, resizeImage } from "./photo";
import { parseExtraction, type ExtractedRecipe } from "./recipe-extract";

// ブラウザ側:写真・文章をサーバー(/api/extract-recipe)へ送り、読み取り結果(下書き)を受け取る。

export class ReadRequestError extends Error {}

/** 写真を、読み取り用の大きさの JPEG にして、data URL にする */
export async function imageToReadDataUrl(file: File): Promise<string> {
  const blob = await resizeImage(file, READ_IMAGE_OPTIONS);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ReadRequestError("写真を読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
}

type Params = { images: string[]; text: string; categories: string[] };

export async function requestRecipeReading({ images, text, categories }: Params): Promise<ExtractedRecipe> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new ReadRequestError("読み取りは、ログインしているときに使えます。");

  let res: Response;
  try {
    res = await fetch("/api/extract-recipe", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ images, text, categories }),
    });
  } catch {
    throw new ReadRequestError("通信できませんでした。ネットワークを確認して、もう一度試してください。");
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "読み取りに失敗しました。";
    throw new ReadRequestError(message);
  }
  const recipe = parseExtraction((body as { recipe?: unknown } | null)?.recipe);
  if (!recipe) throw new ReadRequestError("レシピを読み取れませんでした。写真を撮り直すか、文章を確認してください。");
  return recipe;
}
