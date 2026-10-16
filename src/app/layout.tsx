import type { Metadata, Viewport } from "next";
import { BottomNav, Logo, TopNav } from "@/components/AppNav";
import { SyncBootstrap } from "@/components/SyncBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "レシピ帳",
  description: "作りたい料理を、目的やタグですぐ探せるレシピ帳",
  applicationName: "レシピ帳",
  // ホーム画面に追加したとき、アプリのように全画面で開く
  appleWebApp: { capable: true, title: "レシピ帳", statusBarStyle: "default" },
  // 古い iPhone(iOS)向け。新しい書き方(mobile-web-app-capable)は、上の設定が出してくれる
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#ff5e57",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SyncBootstrap />
        <header className="bg-white shadow-[0_3px_0_var(--color-line)] print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
            <Logo />
            <TopNav />
          </div>
        </header>
        <main className="app-main mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
