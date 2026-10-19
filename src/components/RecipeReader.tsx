"use client";

import { useEffect, useState } from "react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { useSync } from "@/hooks/use-sync";
import {
  MAX_READ_IMAGES,
  MAX_READ_TEXT_CHARS,
  MIN_READ_TEXT_CHARS,
  type ExtractedRecipe,
} from "@/lib/recipe-extract";
import { imageToReadDataUrl, requestRecipeReading } from "@/lib/recipe-reader-client";
import { joinTranscript } from "@/lib/speech";

type Props = {
  categories: string[];
  /** いま入力欄に何か入っているか(入っていれば、置き換える前に確認する) */
  hasContent: boolean;
  onApply: (recipe: ExtractedRecipe) => void;
};

type Picked = { file: File; url: string };

/** 写真・文章からレシピを読み取って、入力欄に入れる(確認前の下書き) */
export function RecipeReader({ categories, hasContent, onApply }: Props) {
  const sync = useSync();
  const signedIn = sync.status === "idle" || sync.status === "syncing" || sync.status === "error";

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [uncertain, setUncertain] = useState<string[] | null>(null);
  const speech = useSpeechInput((spoken) => setText((prev) => joinTranscript(prev, spoken, MAX_READ_TEXT_CHARS)));

  // 選んだ写真のプレビュー用URLは、使い終わったら解放する
  useEffect(() => {
    return () => picked.forEach((p) => URL.revokeObjectURL(p.url));
  }, [picked]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError("");
    const room = MAX_READ_IMAGES - picked.length;
    if (files.length > room) setError(`写真は、1回に${MAX_READ_IMAGES}枚までです。`);
    setPicked([...picked, ...files.slice(0, Math.max(room, 0)).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  const canRead = !busy && (picked.length > 0 || text.trim().length >= MIN_READ_TEXT_CHARS);

  async function run() {
    speech.stop();
    setConfirming(false);
    setBusy(true);
    setError("");
    setUncertain(null);
    try {
      const images = await Promise.all(picked.map((p) => imageToReadDataUrl(p.file)));
      const recipe = await requestRecipeReading({ images, text, categories });
      onApply(recipe);
      setUncertain(recipe.uncertain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み取りに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  function handleRead() {
    if (!canRead) return;
    if (hasContent) setConfirming(true);
    else void run();
  }

  return (
    <section className="rounded-2xl border-2 border-orange-200 bg-orange-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-orange-900"
      >
        <span>写真・文章からレシピを読み取る(任意)</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-orange-200 px-4 py-3 text-sm">
          <p className="text-stone-700">
            レシピの写真(本・メモ・手書き・画面のスクリーンショット)や、コピーした文章から、材料や手順を入力欄に入れます。
            <strong className="font-medium">
              読み間違いが出ることがあります(特に手書き・分量の数字)。入った内容は、必ず確認して直してください。
            </strong>
          </p>

          {!signedIn ? (
            <p className="rounded-xl bg-white px-3 py-2 text-orange-900">
              読み取りは、ログインしているときに使えます。「設定」の「ほかの端末と同期する」で、ログインしてください。
            </p>
          ) : (
            <>
              <div>
                <p className="mb-1 font-medium">
                  写真<span className="ml-2 text-xs font-normal text-stone-500">最大{MAX_READ_IMAGES}枚(同じレシピの続きとして読みます)</span>
                </p>
                {picked.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {picked.map((p, i) => (
                      <div key={p.url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={`読み取る写真${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                        <button
                          type="button"
                          onClick={() => setPicked(picked.filter((_, j) => j !== i))}
                          disabled={busy}
                          aria-label={`写真${i + 1}を外す`}
                          className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-700 text-xs text-white disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {picked.length < MAX_READ_IMAGES && (
                  <label
                    className={`inline-block cursor-pointer rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2.5 hover:bg-orange-50 sm:py-2 ${
                      busy ? "pointer-events-none opacity-40" : ""
                    }`}
                  >
                    写真を選ぶ・撮る
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePick}
                      disabled={busy}
                      aria-label="読み取る写真を選ぶ"
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              <div>
                <label htmlFor="read-text" className="mb-1 block font-medium">
                  文章を貼りつける・声で話す
                  <span className="ml-2 text-xs font-normal text-stone-500">任意</span>
                </label>
                <textarea
                  id="read-text"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_READ_TEXT_CHARS))}
                  rows={4}
                  placeholder="レシピの文章をコピーして貼りつけるか、「話して入れる」を押して、材料や作り方を話します"
                  disabled={busy}
                  className="w-full rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-3 py-2 outline-none focus:border-orange-500"
                />
              </div>

              {speech.supported ? (
                <div>
                  <button
                    type="button"
                    onClick={speech.listening ? speech.stop : speech.start}
                    disabled={busy}
                    aria-pressed={speech.listening}
                    className={`btn-pop rounded-xl border-2 px-4 py-2.5 font-bold disabled:opacity-50 sm:py-2 ${
                      speech.listening
                        ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-700"
                        : "border-line bg-white hover:bg-orange-50"
                    }`}
                  >
                    {speech.listening ? "■ 話し終わった(止める)" : "🎤 話して入れる"}
                  </button>
                  {speech.listening && (
                    <p role="status" className="mt-2 rounded-xl bg-white px-3 py-2 text-stone-800">
                      聞いています…材料と分量、作り方を、ふつうに話してください。
                      {speech.interim && <span className="text-stone-500"> {speech.interim}</span>}
                    </p>
                  )}
                  {speech.error && (
                    <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-red-700">
                      {speech.error}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-stone-600">
                    声は、お使いのブラウザの音声認識で文字になります(端末や、ブラウザの会社のサーバーに送られることがあります)。聞き間違いがあるので、文字になったあと、直してから「読み取る」を押せます。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-600">
                  このブラウザには、話して入れる機能がありません。キーボードにあるマイクのボタンで、声で入れられます。
                </p>
              )}

              {confirming ? (
                <div className="rounded-xl bg-white p-3">
                  <p className="mb-2 text-stone-800">いま入力欄にある内容は、読み取った内容に置き換わります。よろしいですか?</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => void run()}
                      className="btn-pop rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700"
                    >
                      置き換えて読み取る
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-xl border-2 border-line bg-white font-bold shadow-pop-sm px-4 py-2 hover:bg-orange-50"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRead}
                  disabled={!canRead}
                  className="btn-pop rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:py-2"
                >
                  {busy ? "読み取っています…(10〜30秒ほど)" : "読み取る"}
                </button>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
                  {error}
                </p>
              )}

              {uncertain && (
                <div role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  <p className="font-medium">入力欄に入れました。内容をよく確認して、直してください。</p>
                  {uncertain.length > 0 && (
                    <>
                      <p className="mt-1 text-xs">読み取りに自信がなかった所:</p>
                      <ul className="list-disc pl-5">
                        {uncertain.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
