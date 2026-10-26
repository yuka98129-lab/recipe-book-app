// 調理モード用の、小さな部品。

export type StepTimer = {
  /** 画面に出す言葉(例: 「10分」「1時間30分」) */
  label: string;
  seconds: number;
};

const MAX_SECONDS = 24 * 3600;

/**
 * 手順の文章から、時間(「10分」「1時間30分」「30秒」「5〜10分」)を見つけて、タイマーの候補にする。
 * 範囲のときは、短いほうの時間にする。「3分の1」「2分割」のような、時間ではないものは、除く。
 */
export function findTimers(step: string): StepTimer[] {
  const t = step.normalize("NFKC");
  const re = /(\d+(?:\.\d+)?)\s*(?:[〜~]\s*(\d+(?:\.\d+)?)\s*)?(時間半|時間|分間|分|秒間|秒)(?![のた割])/g;
  const found: { start: number; end: number; seconds: number; label: string }[] = [];
  for (const m of t.matchAll(re)) {
    const low = Number(m[1]);
    const unit = m[3];
    const per = unit.startsWith("時間") ? 3600 : unit.startsWith("分") ? 60 : 1;
    const extra = unit === "時間半" ? 1800 : 0;
    found.push({ start: m.index!, end: m.index! + m[0].length, seconds: Math.round(low * per + extra), label: m[0].replace(/\s+/g, "") });
  }
  // 「1時間30分」のように、すぐあとに続く時間は、1つにまとめる
  const merged: typeof found = [];
  for (const f of found) {
    const prev = merged[merged.length - 1];
    if (prev && /時間$/.test(prev.label) && /分$|分間$/.test(f.label) && f.start - prev.end <= 1) {
      prev.seconds += f.seconds;
      prev.label += f.label;
      prev.end = f.end;
    } else merged.push({ ...f });
  }
  const out: StepTimer[] = [];
  const seen = new Set<string>();
  for (const f of merged) {
    if (f.seconds <= 0 || f.seconds > MAX_SECONDS || seen.has(f.label)) continue;
    seen.add(f.label);
    out.push({ label: f.label, seconds: f.seconds });
  }
  return out.slice(0, 3);
}

/** 残り時間の表示(65 → 「1:05」、3700 → 「1:01:40」) */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 声で読み上げる時間(300 → 「5分」、90 → 「1分30秒」、3700 → 「1時間1分40秒」) */
export function formatSpoken(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  if (s === 0) return "0秒";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}時間` : ""}${m > 0 ? `${m}分` : ""}${sec > 0 ? `${sec}秒` : ""}`;
}
