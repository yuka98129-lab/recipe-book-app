import type { MetadataRoute } from "next";

// 「ホーム画面に追加」したとき、アプリのアイコン・名前・色で開くための設定
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "レシピ帳",
    short_name: "レシピ帳",
    description: "作りたい料理を、目的やタグですぐ探せるレシピ帳",
    start_url: "/",
    display: "standalone",
    background_color: "#fff7e8",
    theme_color: "#ff5e57",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
