"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { findTimers, formatClock, formatSpoken, type StepTimer } from "@/lib/cooking";
import { scaleIngredient } from "@/lib/quantity";
import { canSpeak, speak, stopSpeaking } from "@/lib/speech-out";
import type { Ingredient, Recipe } from "@/lib/types";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice-commands";

type Props = {
  recipe: Recipe;
  /** 何人分で作るか(分量は、この人数に合わせて計算して出す)。レシピに人数がなければ undefined */
  servings: number | undefined;
  onClose: () => void;
};

type RunningTimer = { id: number; label: string; endAt: number; done: boolean };

/** 現在時刻(ミリ秒)。画面の描画の外で、時計を読むための入口 */
const nowMs = () => Date.now();

const SIZE_KEY = "cooking:size:v1";
/** 自分で決めるタイマーの、早押しボタン(分) */
const QUICK_MINUTES = [1, 3, 5, 10, 15, 30] as const;
const SIZES = [
  { label: "小", step: "text-xl", ing: "text-base" },
  { label: "中", step: "text-2xl sm:text-3xl", ing: "text-lg" },
  { label: "大", step: "text-3xl sm:text-4xl", ing: "text-xl" },
] as const;

function loadSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return n >= 0 && n < SIZES.length && Number.isInteger(n) ? n : 1;
  } catch {
    return 1;
  }
}

/** 読み上げている間(と、そのあと少し)は、自分の声を、聞き取らないようにするための印 */
const speaking = { on: false };
function say(text: string) {
  speaking.on = true;
  const ok = speak(text, () => {
    setTimeout(() => {
      speaking.on = false;
    }, 700);
  });
  if (!ok) speaking.on = false;
}

/** ピピッという音(ブラウザが許すときだけ。鳴らなくても、画面とバイブで伝える) */
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      o.start(t);
      o.stop(t + 0.2);
    }
  } catch {
    // 音が鳴らせなくても、画面の表示は出る
  }
}

function IngredientList({ title, items, big, checks, onCheck }: { title: string; items: Ingredient[]; big: string; checks?: Set<string>; onCheck?: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-black text-stone-600">{title}</h3>
      <ul className="divide-y-2 divide-dashed divide-line rounded-2xl bg-white shadow-pop">
        {items.map((ing, i) => {
          const key = `${title}:${i}`;
          const on = checks?.has(key) ?? false;
          const inner = (
            <>
              <span className={`min-w-0 break-words font-bold ${on ? "text-stone-400 line-through" : ""}`}>{ing.name}</span>
              <span className={`shrink-0 text-right font-black ${on ? "text-stone-400 line-through" : "text-stone-800"}`}>{ing.quantity}</span>
            </>
          );
          return (
            <li key={key}>
              {onCheck ? (
                <button type="button" role="checkbox" aria-checked={on} onClick={() => onCheck(key)} className={`flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left ${big}`}>
                  <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-mint bg-mint text-white" : "border-line bg-white"}`}>{on ? "✓" : ""}</span>
                  <span className="flex min-w-0 flex-1 justify-between gap-3">{inner}</span>
                </button>
              ) : (
                <div className={`flex justify-between gap-3 px-4 py-2 ${big}`}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 調理モード: 手順を、大きい文字で、1つずつ出す。画面が消えにくく、「◯分」の手順には、タイマーのボタンが出る */
export function CookingMode({ recipe, servings, onClose }: Props) {
  const total = recipe.steps.length;
  // 0 = 材料の確認、1〜total = 手順、total+1 = できあがり
  const [page, setPage] = useState(0);
  // 調理モードは、押したときに開くので、ここで端末の設定を読んでも、サーバーの描画とずれない
  const [size, setSize] = useState(loadSize);
  const [showIng, setShowIng] = useState(false);
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(nowMs);
  const [lock, setLock] = useState<"on" | "off" | "unsupported">("off");
  const closeRef = useRef<HTMLButtonElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const seq = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const notified = useRef(new Set<number>());
  // 声の操作・読み上げ
  const [autoRead, setAutoRead] = useState(false);
  const [heard, setHeard] = useState("");
  const [customMin, setCustomMin] = useState("");
  const act = useRef<(c: VoiceCommand) => void>(() => {});

  const factor = servings && recipe.servings ? servings / recipe.servings : 1;
  const scale = (items: Ingredient[]) => items.map((i) => scaleIngredient(i, factor));
  const groups = [
    { title: "材料", items: scale(recipe.ingredients) },
    { title: "調味料", items: scale(recipe.seasonings) },
    ...recipe.extraGroups.map((g) => ({ title: g.name || "追加", items: scale(g.items) })),
  ];

  // 画面が消えにくいようにする(使えるブラウザだけ。タブを離れて戻ったら、もう一度お願いする)
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (!("wakeLock" in navigator)) return setLock("unsupported");
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) void sentinel.release();
        else setLock("on");
        sentinel.addEventListener("release", () => !cancelled && setLock("off"));
      } catch {
        setLock("off");
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  // 開いている間は、後ろの画面が動かないようにする
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // タイマー(終わる時刻で数えるので、画面を離れていても、ずれない)
  useEffect(() => {
    if (timers.length === 0) return;
    const id = setInterval(() => setNow(nowMs()), 500);
    return () => clearInterval(id);
  }, [timers.length]);
  useEffect(() => {
    for (const t of timers) {
      if (!t.done && now >= t.endAt && !notified.current.has(t.id)) {
        notified.current.add(t.id);
        setTimers((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: true } : x)));
        beep(audio.current);
        navigator.vibrate?.([300, 150, 300, 150, 300]);
        // 手が離せなくても分かるよう、声でも知らせる(ピピッのあと)
        setTimeout(() => say(`${t.label}、たちました`), 1200);
      }
    }
  }, [now, timers]);

  const go = useCallback((d: number) => setPage((p) => Math.min(total + 1, Math.max(0, p + d))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  /** 音は、ボタンを押したときに、準備しておく(そうしないと、ブラウザが鳴らさない) */
  function ensureAudio() {
    if (!audio.current) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) audio.current = new AC();
      } catch {
        audio.current = null;
      }
    }
    void audio.current?.resume?.();
  }

  function startTimerSeconds(label: string, seconds: number) {
    ensureAudio();
    const id = ++seq.current;
    const t0 = nowMs();
    setNow(t0);
    setTimers((ts) => [...ts, { id, label, endAt: t0 + seconds * 1000, done: false }].slice(-4));
  }
  const startTimer = (t: StepTimer) => startTimerSeconds(t.label, t.seconds);

  function startCustom() {
    const n = Number(customMin.normalize("NFKC").trim());
    if (!Number.isFinite(n) || n <= 0 || n > 600) return;
    startTimerSeconds(`${formatSpoken(Math.round(n * 60))}`, Math.round(n * 60));
    setCustomMin("");
  }

  function changeSize(d: number) {
    const next = Math.min(SIZES.length - 1, Math.max(0, size + d));
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, String(next));
    } catch {
      // 保存できなくても、今回は変わる
    }
  }

  const sz = SIZES[size];
  const stepText = page >= 1 && page <= total ? recipe.steps[page - 1] : "";
  const stepTimers = stepText ? findTimers(stepText) : [];
  // 読み上げる文(材料の確認・手順・できあがり)
  const readText =
    page === 0
      ? `材料の確認です。${groups.flatMap((g) => g.items).map((i) => `${i.name}、${i.quantity}`).join("。")}`
      : page <= total
        ? `手順${page}。${stepText}`
        : "できあがりです。おつかれさまでした。";

  // 声で動かす(最新の画面の状態を見て動くよう、毎回、入れ直す)
  useEffect(() => {
    act.current = (c) => {
      switch (c.type) {
        case "next":
          go(1);
          break;
        case "prev":
          go(-1);
          break;
        case "read":
          say(readText);
          break;
        case "ingredients":
          if (page === 0) say(readText);
          else if (page <= total) setShowIng((v) => !v);
          break;
        case "stopTimers": {
          stopSpeaking();
          if (timers.length > 0) {
            const finished = timers.some((t) => t.done);
            setTimers((ts) => (finished ? ts.filter((t) => !t.done) : []));
            say(finished ? "とめました" : "タイマーを、やめました");
          }
          break;
        }
        case "remaining": {
          const running = timers.filter((t) => !t.done).sort((x, y) => x.endAt - y.endAt)[0];
          say(running ? `あと${formatSpoken((running.endAt - nowMs()) / 1000)}です` : "タイマーは、動いていません");
          break;
        }
        case "timer": {
          const sec = c.seconds ?? stepTimers[0]?.seconds;
          if (!sec) {
            say("何分か、教えてください。たとえば、タイマー5分、と言ってください");
            break;
          }
          startTimerSeconds(formatSpoken(sec), sec);
          say(`${formatSpoken(sec)}のタイマーを、はじめます`);
          break;
        }
      }
    };
  });
  const voice = useSpeechInput((text) => {
    if (speaking.on) return;
    setHeard(text.trim().slice(0, 40));
    const cmd = parseVoiceCommand(text);
    if (cmd) act.current(cmd);
  });

  // 手順をめくったら、自動で読み上げる(切り替えられる)
  useEffect(() => {
    if (autoRead) say(readText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, page]);
  // とじるときは、読み上げを止める
  useEffect(() => () => stopSpeaking(), []);

  const progress = page === 0 ? 0 : Math.min(page, total) / total;
  const checkedAll = groups.every((g) => g.items.every((_, i) => checks.has(`${g.title}:${i}`)));

  return (
    <div role="dialog" aria-modal="true" aria-label={`${recipe.name}の調理モード`} className="fixed inset-0 z-50 flex flex-col bg-cream" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex items-center gap-2 bg-white px-3 py-2 shadow-[0_3px_0_var(--color-line)]">
        <button ref={closeRef} type="button" onClick={onClose} className="min-h-[44px] shrink-0 rounded-xl border-2 border-line bg-white px-3 text-sm font-black text-ink hover:bg-orange-50">
          とじる
        </button>
        <p className="min-w-0 flex-1 truncate text-center font-black">{recipe.name}</p>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="文字の大きさ">
          <button type="button" onClick={() => changeSize(-1)} disabled={size === 0} aria-label="文字を小さく" className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-line bg-white text-sm font-black disabled:opacity-40">
            A−
          </button>
          <button type="button" onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} aria-label="文字を大きく" className="min-h-[44px] min-w-[44px] rounded-xl border-2 border-line bg-white text-base font-black disabled:opacity-40">
            A＋
          </button>
        </div>
      </header>

      <div className="h-2 w-full bg-orange-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(Math.max(page, 0), total)} aria-label="手順の進み具合">
        <div className="h-full bg-orange-600 transition-all" style={{ width: `${progress * 100}%` }} />
      </div>

      {timers.length > 0 && (
        <div className="space-y-1 px-3 pt-2" aria-live="polite">
          {timers.map((t) => (
            <div key={t.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 font-black ${t.done ? "animate-pulse bg-sun text-ink" : "bg-mintbg text-teal-900"}`}>
              <span>{t.done ? `${t.label}たちました!` : `${t.label}タイマー`}</span>
              {!t.done && <span className="text-xl tabular-nums">{formatClock((t.endAt - now) / 1000)}</span>}
              <span className="flex gap-1">
                {!t.done && (
                  <button type="button" onClick={() => setTimers((ts) => ts.map((x) => (x.id === t.id ? { ...x, endAt: x.endAt + 60000 } : x)))} className="min-h-[40px] rounded-lg border-2 border-current px-2 text-sm">
                    +1分
                  </button>
                )}
                <button type="button" onClick={() => setTimers((ts) => ts.filter((x) => x.id !== t.id))} className="min-h-[40px] rounded-lg border-2 border-current px-3 text-sm">
                  {t.done ? "止める" : "やめる"}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <main
        className="flex-1 overflow-y-auto px-4 py-4"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          // 横にはっきり動かしたときだけ(縦のスクロールでは、動かない)
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {page === 0 && (
            <>
              <p className="text-sm font-black text-orange-700">はじめる前に、材料の確認{servings ? `(${servings}人分)` : ""}</p>
              <p className="text-xs text-stone-600">そろったものを、タップしてチェックします。{factor !== 1 ? "分量は、人数に合わせて計算してあります(目安です)。" : ""}</p>
              {groups.map((g) => (
                <IngredientList key={g.title} title={g.title} items={g.items} big={sz.ing} checks={checks} onCheck={(k) => setChecks((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
              ))}
              {checkedAll && <p className="rounded-xl bg-mintbg p-3 text-center font-black text-teal-900">ぜんぶそろいました!</p>}
            </>
          )}

          {page >= 1 && page <= total && (
            <div>
              <p className="mb-2 flex items-center gap-2 font-black text-orange-700">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-lg text-white shadow-[0_2px_0_var(--color-orange-900)]">{page}</span>
                手順 {page} / {total}
              </p>
              <p className={`whitespace-pre-wrap font-bold leading-relaxed text-ink ${sz.step}`}>{stepText}</p>
              {stepTimers.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {stepTimers.map((t) => (
                    <button key={t.label} type="button" onClick={() => startTimer(t)} className="btn-pop min-h-[52px] rounded-2xl bg-mint-d px-5 text-lg font-black text-white">
                      {t.label}のタイマー
                    </button>
                  ))}
                </div>
              )}
              <section aria-label="タイマーを自分で決める" className="mt-4 rounded-2xl bg-white p-3 shadow-pop-sm">
                <p className="mb-2 text-sm font-black text-stone-700">ほかの時間で、タイマーをセット</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_MINUTES.map((m) => (
                    <button key={m} type="button" onClick={() => startTimerSeconds(`${m}分`, m * 60)} className="min-h-[48px] min-w-[64px] rounded-xl border-2 border-mint-d bg-mintbg px-3 text-base font-black text-teal-900 hover:bg-teal-100">
                      {m}分
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm font-bold">
                    <span className="sr-only">タイマーの分数</span>
                    <input
                      value={customMin}
                      onChange={(e) => setCustomMin(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) startCustom();
                      }}
                      inputMode="decimal"
                      placeholder="2.5"
                      aria-label="タイマーの分数"
                      className="w-20 rounded-xl border-2 border-line px-3 py-2 text-right text-base"
                    />
                    分
                  </label>
                  <button type="button" onClick={startCustom} className="min-h-[44px] rounded-xl bg-mint-d px-4 text-sm font-black text-white">
                    はじめる
                  </button>
                </div>
              </section>
              {page < total && <p className="mt-6 rounded-xl bg-white p-3 text-sm text-stone-600 shadow-pop-sm"><span className="font-black">つぎ: </span>{recipe.steps[page].length > 40 ? `${recipe.steps[page].slice(0, 40)}…` : recipe.steps[page]}</p>}
            </div>
          )}

          {page === total + 1 && (
            <div className="space-y-3 py-10 text-center">
              <p className="text-4xl font-black text-orange-700">できあがり!</p>
              <p className="text-stone-600">おつかれさまでした。</p>
              <button type="button" onClick={onClose} className="btn-pop min-h-[52px] rounded-2xl bg-orange-600 px-8 text-lg font-black text-white">レシピにもどる</button>
            </div>
          )}
        </div>
      </main>

      {showIng && page >= 1 && page <= total && (
        <div className="max-h-[55vh] overflow-y-auto border-t-4 border-line bg-cream px-4 py-3">
          <div className="mx-auto max-w-2xl space-y-3">
            {groups.map((g) => (
              <IngredientList key={g.title} title={g.title} items={g.items} big={sz.ing} />
            ))}
          </div>
        </div>
      )}

      {page <= total && (
        <footer className="bg-white px-3 py-2 shadow-[0_-3px_0_var(--color-line)]">
          <div className="mx-auto mb-2 max-w-2xl space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {voice.supported ? (
                <button
                  type="button"
                  onClick={() => {
                    if (voice.listening) voice.stop();
                    else {
                      ensureAudio();
                      voice.start();
                    }
                  }}
                  aria-pressed={voice.listening}
                  className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-black ${voice.listening ? "border-red-600 bg-red-600 text-white" : "border-line bg-white"}`}
                >
                  {voice.listening ? "● 声で操作中(止める)" : "🎤 声で操作"}
                </button>
              ) : (
                <span className="text-xs text-stone-600">このブラウザは、声の操作に対応していません(Chrome や Safari で、お試しください)</span>
              )}
              {canSpeak() && (
                <>
                  <button type="button" onClick={() => say(readText)} className="min-h-[44px] rounded-xl border-2 border-line bg-white px-3 text-sm font-black">
                    🔊 読んで
                  </button>
                  <label className="flex min-h-[44px] items-center gap-1.5 text-sm font-bold">
                    <input type="checkbox" checked={autoRead} onChange={(e) => { setAutoRead(e.target.checked); if (!e.target.checked) stopSpeaking(); }} className="h-5 w-5" />
                    めくったら読む
                  </label>
                </>
              )}
            </div>
            {voice.listening && (
              <p role="status" className="text-xs text-stone-700">
                聞いています。「つぎ」「まえ」「タイマー5分」「あと何分」「読んで」「とめて」と言ってみてください。
                {voice.interim || heard ? <span className="ml-1 font-black">聞こえた言葉: {voice.interim || heard}</span> : null}
              </p>
            )}
            {voice.error && <p role="alert" className="text-xs text-red-700">{voice.error}</p>}
          </div>
          <p className="mb-1 text-center text-[11px] text-stone-500">
            {lock === "on" ? "画面が消えにくくなっています" : lock === "unsupported" ? "このブラウザでは、画面が消えるのを止められません(端末の設定で、画面オフまでの時間を長くしてください)" : "左右になぞっても、めくれます"}
          </p>
          <div className="mx-auto flex max-w-2xl gap-2">
            <button type="button" onClick={() => go(-1)} disabled={page === 0} className="min-h-[56px] flex-1 rounded-2xl border-2 border-line bg-white text-lg font-black disabled:opacity-40">
              ← まえ
            </button>
            {page >= 1 && (
              <button type="button" onClick={() => setShowIng((v) => !v)} aria-pressed={showIng} className={`min-h-[56px] flex-1 rounded-2xl border-2 text-base font-black ${showIng ? "border-mint-d bg-mintbg text-teal-900" : "border-line bg-white"}`}>
                材料
              </button>
            )}
            <button type="button" onClick={() => go(1)} className="btn-pop min-h-[56px] flex-[2] rounded-2xl bg-orange-600 text-lg font-black text-white hover:bg-orange-700">
              {page === 0 ? "はじめる →" : page === total ? "できた!" : "つぎ →"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
