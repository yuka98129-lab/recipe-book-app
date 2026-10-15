"use client";

import { useState } from "react";
import { usePhotoUrl } from "@/hooks/use-photo-url";

type Props = {
  /** Storage の中のパス。無ければ「写真なし」の枠を出す */
  path: string | undefined;
  alt: string;
  /** 大きさ・角丸など(幅と高さを必ず指定する) */
  className: string;
  /** 写真がないとき・表示できないときに枠の中へ出す文字 */
  emptyLabel?: string;
};

/** レシピの写真。読み込み中・未ログイン・写真なしのときは、灰色の枠を出す */
export function RecipePhoto({ path, alt, className, emptyLabel }: Props) {
  const photo = usePhotoUrl(path);
  // 一時URLの期限切れなどで画像の読み込みに失敗したURL
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (photo.status === "ready" && photo.url && photo.url !== brokenUrl) {
    const url = photo.url;
    // 表示のたびに作る一時URLを使うため、next/image ではなく通常の img を使う
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setBrokenUrl(url)}
        className={`${className} object-cover`}
      />
    );
  }

  const failed = photo.status === "failed" || (photo.status === "ready" && photo.url === brokenUrl);
  const label = photo.status === "loading" ? "" : failed ? "写真を表示できません" : (emptyLabel ?? "");

  return (
    <div
      aria-hidden={label === ""}
      className={`${className} flex items-center justify-center bg-stone-200 px-1 text-center text-[11px] leading-tight text-stone-500`}
    >
      {label}
    </div>
  );
}
