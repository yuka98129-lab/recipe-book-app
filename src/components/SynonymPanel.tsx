"use client";

import { useState } from "react";
import { useUserSynonyms } from "@/hooks/use-synonyms";
import { addGroup, removeGroup, SynonymStoreError } from "@/lib/synonym-store";
import { DEFAULT_SYNONYMS, splitGroup } from "@/lib/synonyms";

/** 設定: 材料の言い換え(同じ材料の別の呼び方)。検索と、冷蔵庫さがしで、同じものとして扱われる */
export function SynonymPanel() {
  const mine = useUserSynonyms();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function add() {
    try {
      const problem = addGroup(splitGroup(text));
      if (problem) return setError(problem);
      setText("");
      setError("");
    } catch (err) {
      setError(err instanceof SynonymStoreError ? err.message : "追加できませんでした。");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-pop-sm" aria-labelledby="syn-title">
      <h2 id="syn-title" className="font-black">
        材料の言い換え
      </h2>
      <p className="text-sm text-stone-600">
        同じ材料の別の呼び方を、いっしょにしておくと、検索と「冷蔵庫の材料から探す」で、同じものとして探せます。たとえば、「白滝、しらたき、糸こんにゃく」。ひらがな・カタカナの違いは、はじめから同じものとして探します。
      </p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              add();
            }
          }}
          aria-label="同じ材料の呼び方(「、」で区切る)"
          placeholder="例: 白滝、しらたき、糸こんにゃく"
          className="w-full rounded-xl border-2 border-line bg-white px-3 py-2 font-bold outline-none focus:border-orange-500"
        />
        <button type="button" onClick={add} className="btn-pop shrink-0 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700">
          追加
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}

      {mine.length > 0 ? (
        <ul className="space-y-2">
          {mine.map((g, i) => (
            <li key={`${g.join("|")}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-butter px-3 py-2">
              <span className="min-w-0 break-words text-sm font-bold text-amber-900">{g.join(" = ")}</span>
              <button type="button" onClick={() => removeGroup(i)} aria-label={`言い換え「${g[0]}」を消す`} className="min-h-[40px] shrink-0 px-2 text-sm text-orange-700 underline">
                消す
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-stone-500">自分で足した言い換えは、まだありません。</p>
      )}
      <p className="text-xs text-stone-500">この言い換えは、この端末にだけ保存されます(他の端末とは、共有されません)。</p>

      <details>
        <summary className="min-h-[40px] cursor-pointer text-sm font-bold text-stone-600">はじめから入っている言い換え({DEFAULT_SYNONYMS.length}組)を見る</summary>
        <ul className="mt-2 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
          {DEFAULT_SYNONYMS.map((g) => (
            <li key={g[0]} className="break-words">{g.join(" = ")}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
