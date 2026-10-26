"use client";

import { useState, useSyncExternalStore } from "react";
import {
  addExtras,
  clearDoneExtras,
  getExtrasSnapshot,
  getServerExtrasSnapshot,
  removeExtra,
  subscribeExtras,
  toggleExtra,
} from "@/lib/shopping-extras";

/** よく買うもの(押すと、メモに入る) */
const QUICK = ["ゴミ袋", "ティッシュ", "トイレットペーパー", "食器用洗剤", "ラップ", "アルミホイル", "キッチンペーパー", "電池"];

/** 買い忘れメモ: 献立の買い物リストとは別の枠。タップで「買えた」のチェックがつく */
export function ShoppingMemo() {
  const items = useSyncExternalStore(subscribeExtras, getExtrasSnapshot, getServerExtrasSnapshot);
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;
  const names = new Set(items.map((i) => i.name));

  function commit() {
    if (text.trim()) addExtras(text.split(/[\n、,，]+/));
    setText("");
  }

  return (
    <section aria-labelledby="memo-title" className="rounded-3xl border-2 border-dashed border-amber-400 bg-butter/50 p-4 print:hidden">
      <h2 id="memo-title" className="font-black text-ink">
        買い忘れメモ
      </h2>
      <p className="mt-1 text-xs text-stone-700">
        ゴミ袋やティッシュなど、スーパーで買えるものを、思いついたときにメモしておけます。献立の買い物リストとは別に、この端末に保存されます。
      </p>

      <div className="mt-3 flex gap-2">
        <label htmlFor="memo-input" className="sr-only">
          買い忘れメモに足す
        </label>
        <input
          id="memo-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 変換中の Enter は、確定のためなので、足さない
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="例: ゴミ袋"
          className="w-full rounded-xl border-2 border-line bg-white px-3 py-2.5 font-bold outline-none focus:border-orange-500"
        />
        <button type="button" onClick={commit} className="btn-pop shrink-0 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">
          足す
        </button>
      </div>

      <details className="mt-2">
        <summary className="py-1 text-xs font-bold text-stone-700">よく買うものから選ぶ(押すと、メモに入ります)</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {QUICK.filter((q) => !names.has(q)).map((q) => (
            <button key={q} type="button" onClick={() => addExtras([q])} className="min-h-[40px] rounded-full border-2 border-line bg-white px-3 text-sm font-bold hover:bg-orange-50">
              ＋ {q}
            </button>
          ))}
        </div>
      </details>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">まだ、メモはありません。</p>
      ) : (
        <>
          <p className="mt-3 text-xs font-extrabold text-amber-900">
            買えた {done} / {items.length}
          </p>
          <ul className="mt-1 space-y-1.5">
            {items.map((it) => (
              <li key={it.name} className="flex items-center gap-1 rounded-2xl bg-white shadow-pop-sm">
                {/* 行ぜんぶが、押せる(手がぬれていても、押しやすい) */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={it.done}
                  onClick={() => toggleExtra(it.name)}
                  className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-3 text-left"
                >
                  <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-black ${it.done ? "border-mint bg-mint text-white" : "border-line bg-white"}`}>
                    {it.done ? "✓" : ""}
                  </span>
                  <span className={`min-w-0 break-words font-bold ${it.done ? "text-stone-500 line-through" : ""}`}>{it.name}</span>
                  {it.done && <span className="shrink-0 rounded-full bg-mintbg px-2 py-0.5 text-[11px] font-black text-teal-900">買えた</span>}
                </button>
                <button type="button" onClick={() => removeExtra(it.name)} aria-label={`${it.name}を、メモから消す`} className="min-h-[44px] shrink-0 px-3 text-sm font-bold text-stone-600">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {done > 0 && (
            <button type="button" onClick={clearDoneExtras} className="mt-2 py-2 text-sm text-stone-700 underline">
              買えたものを、ぜんぶ消す
            </button>
          )}
        </>
      )}
    </section>
  );
}
