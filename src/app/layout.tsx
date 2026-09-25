import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "レシピ帳",
  description: "作りたい料理を、目的やタグですぐ探せるレシピ帳",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="py-2 text-lg font-bold text-stone-900 sm:py-0">
              レシピ帳
            </Link>
            <Link
              href="/recipes/new"
              className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 sm:py-1.5"
            >
              ＋ レシピを登録
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
