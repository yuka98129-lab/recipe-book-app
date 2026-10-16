"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "recipes" | "plan" | "shopping" | "settings";

function activeTab(pathname: string): TabKey | null {
  if (pathname === "/" || pathname.startsWith("/recipes")) return "recipes";
  if (pathname.startsWith("/plan/shopping")) return "shopping";
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}

const svg = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS: Record<TabKey, React.ReactNode> = {
  recipes: (
    <svg viewBox="0 0 24 24" {...svg} className="h-6 w-6" aria-hidden>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H19v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
      <path d="M8 4v15" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" {...svg} className="h-6 w-6" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  ),
  shopping: (
    <svg viewBox="0 0 24 24" {...svg} className="h-6 w-6" aria-hidden>
      <path d="M5 7h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" {...svg} className="h-6 w-6" aria-hidden>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
    </svg>
  ),
};

const TABS: { key: TabKey; href: string; label: string }[] = [
  { key: "recipes", href: "/", label: "レシピ" },
  { key: "plan", href: "/plan", label: "献立" },
  { key: "shopping", href: "/plan/shopping", label: "買い物" },
  { key: "settings", href: "/settings", label: "設定" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 py-1 text-lg font-black tracking-wide text-ink">
      <span className="grid h-8 w-8 -rotate-6 place-items-center rounded-[10px] bg-orange-500 text-white shadow-[0_3px_0_var(--color-orange-800)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M4 5.5C4 4.7 4.7 4 5.5 4H19v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
          <path d="M8 4v15" />
        </svg>
      </span>
      レシピ帳
    </Link>
  );
}

/** パソコン幅: 上のメニュー */
export function TopNav() {
  const active = activeTab(usePathname());
  return (
    <nav aria-label="メインメニュー" className="hidden items-center gap-1 sm:flex">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${
            active === t.key ? "bg-orange-100 text-orange-700" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
      <Link
        href="/recipes/new"
        className="btn-pop ml-2 rounded-full bg-sun px-4 py-2 text-sm font-extrabold text-ink shadow-[0_3px_0_var(--color-sun-d)]"
      >
        ＋ レシピを登録
      </Link>
    </nav>
  );
}

/** スマホ幅: 画面の下に並ぶアイコンのボタン(まん中の「＋」が新規登録) */
export function BottomNav() {
  const active = activeTab(usePathname());
  const item = (t: (typeof TABS)[number]) => (
    <Link
      key={t.key}
      href={t.href}
      aria-current={active === t.key ? "page" : undefined}
      className={`flex w-16 flex-col items-center gap-0.5 text-[11px] font-extrabold ${
        active === t.key ? "text-orange-600" : "text-stone-500"
      }`}
    >
      <span className={`rounded-2xl px-4 py-1 ${active === t.key ? "bg-orange-100" : ""}`}>{ICONS[t.key]}</span>
      {t.label}
    </Link>
  );
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around rounded-t-3xl bg-white px-2 pt-2 shadow-[0_-4px_0_var(--color-line)] print:hidden sm:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {item(TABS[0])}
      {item(TABS[1])}
      <Link
        href="/recipes/new"
        aria-label="レシピを登録"
        className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-cream bg-orange-500 text-white shadow-[0_4px_0_var(--color-orange-800)] active:translate-y-0.5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" className="h-7 w-7" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      {item(TABS[2])}
      {item(TABS[3])}
    </nav>
  );
}
