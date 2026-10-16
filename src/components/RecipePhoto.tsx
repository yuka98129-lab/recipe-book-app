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
  /** 写真がないとき、色を決めるための文字(レシピのIDなど)。同じ文字なら、いつも同じ色 */
  seed?: string;
};

/** レシピの写真。読み込み中・未ログイン・写真なしのときは、色つきの枠を出す */
const GRADIENTS = [
  "from-orange-400 to-orange-500",
  "from-emerald-300 to-teal-500",
  "from-amber-300 to-orange-400",
  "from-rose-300 to-orange-300",
];
const gradientFor = (seed: string) => GRADIENTS[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

export function RecipePhoto({ path, alt, className, emptyLabel, seed = "" }: Props) {
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
      className={`${className} flex items-center justify-center bg-gradient-to-br ${gradientFor(seed || alt)} px-1 text-center text-[11px] font-extrabold leading-tight text-white`}
    >
      {label}
    </div>
  );
}
