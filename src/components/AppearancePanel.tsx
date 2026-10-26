"use client";

import { useSyncExternalStore } from "react";
import { SIZES, THEMES } from "@/lib/appearance";
import { getServerSnapshot, getSnapshot, setAppearance, subscribe } from "@/lib/appearance-store";

/** 設定: 色(コーラル・赤・ブルー)と、文字の大きさ */
export function AppearancePanel() {
  const a = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-pop-sm" aria-labelledby="look-title">
      <h2 id="look-title" className="font-black">
        色と文字
      </h2>

      <div>
        <p className="mb-2 text-sm font-bold" id="theme-label">アプリの色</p>
        <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const on = a.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAppearance({ theme: t.id })}
                className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2 text-sm font-black ${on ? "border-orange-600 bg-orange-50" : "border-line bg-white hover:bg-orange-50"}`}
              >
                <span aria-hidden className="h-7 w-7 rounded-full border-2 border-white shadow-[0_0_0_2px_var(--color-line)]" style={{ background: t.swatch }} />
                {t.label}
                <span className="text-xs font-normal text-stone-600">{on ? "選択中" : t.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold" id="size-label">文字の大きさ</p>
        <div role="radiogroup" aria-labelledby="size-label" className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => {
            const on = a.size === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAppearance({ size: s.id })}
                className={`min-h-[52px] rounded-2xl border-2 px-2 text-sm font-black ${on ? "border-orange-600 bg-orange-600 text-white" : "border-line bg-white hover:bg-orange-50"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-stone-600">この設定は、この端末にだけ保存されます。</p>
      </div>
    </section>
  );
}
