import { isPhotoPath, makePhotoPath, PHOTO_BUCKET } from "./photo-path";
import { getSupabase } from "./supabase";

// 写真の変換・アップロード・表示用URLの取得。ログイン中(同期がオン)のときだけ使える。
// レシピ本体は localStorage、写真は Supabase Storage(非公開)に置く。

export class PhotoError extends Error {}

/** 長いほうの辺の上限(px)と、JPEGの画質。保存容量を節約しつつ、料理の写真として十分な大きさにする */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.82;

/** レシピの読み取り用。文字が読めるよう、保存用より大きく・きれいにする */
export const READ_IMAGE_OPTIONS = { maxSide: 1600, quality: 0.85 } as const;

/** 撮った・選んだ写真を、JPEG に変換して小さくする(向きも直す) */
export async function resizeImage(
  file: File,
  { maxSide = MAX_SIDE, quality = JPEG_QUALITY }: { maxSide?: number; quality?: number } = {},
): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new PhotoError("画像ファイルを選んでください。");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new PhotoError("この写真は読み込めませんでした。JPEG や PNG の写真を選んでください。");
    }
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new PhotoError("写真を変換できませんでした。");
  }
  // 透明な部分(PNG など)が黒くならないよう、白で下地を塗る
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new PhotoError("写真を変換できませんでした。");
  return blob;
}

/** 写真を Storage に送り、保存先のパスを返す。ログインしていなければ PhotoError */
export async function uploadPhoto(blob: Blob): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new PhotoError("写真を使うには、ログインが必要です。");
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new PhotoError("写真を使うには、ログインが必要です。");

  const path = makePhotoPath(userId, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) {
    throw new PhotoError(
      "写真を送れませんでした。ネットワークを確認して、もう一度試してください。写真の設定(photos.sql)を実行しているかも確認してください。",
    );
  }
  return path;
}

/** 写真を Storage から消す。失敗しても、レシピの操作は止めない(取り残しは容量を少し使うだけ) */
export async function removePhoto(path: string): Promise<void> {
  if (!isPhotoPath(path)) return;
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch {
    // 無視する
  }
}

// --- 表示用の一時URL ---
// 写真は非公開なので、表示のたびに「1時間だけ使えるURL」を作る。同じ写真は、しばらく使い回す。

const URL_LIFETIME_S = 3600;
const REUSE_MS = 50 * 60 * 1000;
const urlCache = new Map<string, { promise: Promise<string | null>; expires: number }>();

export function getPhotoUrl(path: string): Promise<string | null> {
  if (!isPhotoPath(path)) return Promise.resolve(null);
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.promise;

  const supabase = getSupabase();
  if (!supabase) return Promise.resolve(null);

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, URL_LIFETIME_S);
      if (error || !data) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  })();
  urlCache.set(path, { promise, expires: Date.now() + REUSE_MS });
  // 失敗(ログイン前・通信エラー)は使い回さない
  void promise.then((url) => {
    if (url === null) urlCache.delete(path);
  });
  return promise;
}
