// 写真の保存場所(Supabase Storage の中のパス)に関する、通信を使わない部分。
// パスは「ログインしている人のID / 写真ごとのランダムなID.jpg」の形にする。
// 先頭が自分のIDのフォルダだけ読み書きできるよう、supabase/photos.sql で鍵をかけている。

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PHOTO_PATH = new RegExp(`^${UUID}/${UUID}\\.jpg$`, "i");

/** 写真を入れる入れ物(バケット)の名前。supabase/photos.sql と同じにする */
export const PHOTO_BUCKET = "recipe-photos";

/** 保存先のパスを作る。写真ごとに新しいIDを使うので、差し替えても古い画像が表示に残らない */
export function makePhotoPath(userId: string, photoId: string): string {
  return `${userId}/${photoId}.jpg`;
}

/** 正しい形の写真パスか。壊れた値・想定外の値は、写真なしとして扱うために使う */
export function isPhotoPath(v: unknown): v is string {
  return typeof v === "string" && PHOTO_PATH.test(v);
}
