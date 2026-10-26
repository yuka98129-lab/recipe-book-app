"use client";

import { useEffect, useState } from "react";
import { useSync } from "@/hooks/use-sync";
import { MAX_FRIDGE_IMAGES, type FridgeReading } from "@/lib/fridge-reader";
import { requestFridgeReading } from "@/lib/fridge-reader-client";
import { imageToReadDataUrl } from "@/lib/recipe-reader-client";

type Props = {
  /** 選んだ材料を、「いまある材料」に入れる */
  onAdd: (names: string[]) => void;
};

type Picked = { file: File; url: string };
type Row = { name: string; sure: boolean; seasoning: boolean; on: boolean };

/** 冷蔵庫の写真から、材料を読み取る。結果は、人が確認(チェックを入れ外し)してから、材料に入れる */
export function FridgePhotoReader({ onAdd }: Props) {
  const sync = useSync();
  const signedIn = sync.status === "idle" || sync.status === "syncing" || sync.status === "error";

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.url)), [picked]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError("");
    const room = MAX_FRIDGE_IMAGES - picked.length;
    if (files.length > room) setError(`写真は、1回に${MAX_FRIDGE_IMAGES}枚までです。`);
    setPicked([...picked, ...files.slice(0, Math.max(room, 0)).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setRows(null);
  }

  async function run() {
    setBusy(true);
    setError("");
    setRows(null);
    try {
      const images = await Promise.all(picked.map((p) => imageToReadDataUrl(p.file)));
      const reading: FridgeReading = await requestFridgeReading(images);
      // はっきり分かった食材は、チェック済み。自信がないもの・調味料は、チェックなし(人が選ぶ)
      setRows(reading.items.map((i) => ({ ...i, on: i.sure && !i.seasoning })));
      setNotes(reading.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み取りに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (name: string) => setRows((rs) => rs && rs.map((r) => (r.name === name ? { ...r, on: !r.on } : r)));
  const chosen = rows?.filter((r) => r.on) ?? [];

  function apply() {
    onAdd(chosen.map((r) => r.name));
    setRows(null);
    setPicked([]);
    setNotes([]);
    setOpen(false);
  }

  const chip = (r: Row) => (
    <button
      key={r.name}
      type="button"
      role="checkbox"
      aria-checked={r.on}
      onClick={() => toggle(r.name)}
      className={`inline-flex min-h-[40px] items-center gap-1 rounded-full border-2 px-3 text-sm font-bold ${
        r.on ? "border-orange-600 bg-orange-600 text-white" : "border-line bg-white text-stone-700"
      }`}
    >
      <span aria-hidden>{r.on ? "✓" : "＋"}</span>
      {r.name}
      {!r.sure && <span className="text-xs opacity-80">(自信なし)</span>}
    </button>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-pop w-full rounded-2xl border-2 border-orange-200 bg-white px-4 py-3 text-sm font-black text-orange-700 hover:bg-orange-50"
      >
        冷蔵庫の写真から、材料を読み取る
      </button>
    );
  }

  const foods = rows?.filter((r) => !r.seasoning) ?? [];
  const seasonings = rows?.filter((r) => r.seasoning) ?? [];

  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-orange-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-black text-ink">冷蔵庫の写真から、材料を読み取る</p>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 py-1 text-sm text-stone-600 underline">
          とじる
        </button>
      </div>
      {!signedIn ? (
        <p className="text-sm text-stone-600">写真の読み取りは、ログインしているときに使えます(設定画面からログインできます)。</p>
      ) : (
        <>
          <p className="text-xs text-stone-600">
            冷蔵庫の中が見えるように、明るい場所で撮ってください(最大{MAX_FRIDGE_IMAGES}枚。段ごとに分けると、よく読めます)。写真は、読み取りのためにAIへ送られます。保存はしません。人の顔や、書類・宛名が写らないようにしてください。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {picked.map((p, i) => (
              <div key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`選んだ写真${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label={`写真${i + 1}を外す`}
                  onClick={() => {
                    setPicked(picked.filter((_, j) => j !== i));
                    setRows(null);
                  }}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-700 text-sm text-white"
                >
                  ×
                </button>
              </div>
            ))}
            {picked.length < MAX_FRIDGE_IMAGES && (
              <label className="flex h-20 min-w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-orange-300 px-3 text-center text-sm font-bold text-orange-700 hover:bg-orange-50">
                写真を
                <br />
                えらぶ・撮る
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handlePick} />
              </label>
            )}
          </div>
          <button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={run}
            className="btn-pop w-full rounded-xl bg-orange-600 px-4 py-2.5 font-bold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? "読み取っています…(10秒ほど)" : "読み取る"}
          </button>
          {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}

          {rows && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-ink">
                見つかった材料です。いまあるものに、チェック(✓)を入れて、「入れる」を押してください。まちがいは、チェックを外します。
              </p>
              <div className="flex flex-wrap gap-2">{foods.map(chip)}</div>
              {seasonings.length > 0 && (
                <details>
                  <summary className="text-xs font-bold text-stone-600">調味料も見つかりました({seasonings.length}件。ふつうは入れなくて大丈夫です)</summary>
                  <div className="mt-2 flex flex-wrap gap-2">{seasonings.map(chip)}</div>
                </details>
              )}
              {notes.length > 0 && <p className="text-xs text-stone-600">AIからのメモ: {notes.join(" / ")}</p>}
              <p className="text-xs text-stone-600">見つからなかった材料は、上の入力欄から、自分で足せます。</p>
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={apply}
                className="btn-pop w-full rounded-xl bg-orange-600 px-4 py-2.5 font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {chosen.length}件を、いまある材料に入れる
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
