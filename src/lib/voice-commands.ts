import { toHiragana } from "./reading";

// 調理モードの、声の操作。話した言葉(音声認識の結果)から、したいことを読み取る。
// 手が濡れていても、「つぎ」「タイマー5分」「あと何分」などで、動かせる。

export type VoiceCommand =
  | { type: "next" }
  | { type: "prev" }
  /** seconds が無いときは、いまの手順に書いてある時間(なければ、決められない) */
  | { type: "timer"; seconds?: number }
  | { type: "stopTimers" }
  | { type: "remaining" }
  | { type: "read" }
  | { type: "ingredients" };

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「五」「十」「十五」「三十」「九十九」を数にする。読めなければ null */
export function kanjiToNumber(s: string): number | null {
  if (!s) return null;
  if (/^[〇零一二三四五六七八九]+$/.test(s)) return s.length <= 2 ? Number([...s].map((c) => KANJI_DIGIT[c]).join("")) : null;
  const m = /^([二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (!m) return null;
  return (m[1] ? KANJI_DIGIT[m[1]] : 1) * 10 + (m[2] ? KANJI_DIGIT[m[2]] : 0);
}

const MAX_SECONDS = 24 * 3600;

/** 言葉の中の「5分」「1時間30分」「三十秒」「1分半」「5ふん」を、秒にする。見つからなければ null */
export function parseDuration(text: string): number | null {
  // 数字は、アラビア数字か漢数字。読み(「ふん」「ぷん」)は、ひらがなにそろえたあとの形も受ける
  const t = text.normalize("NFKC").replace(/[\s　、。,.]/g, "");
  const num = String.raw`(\d+(?:\.\d+)?|[〇零一二三四五六七八九十]+)`;
  const val = (s: string) => (/^\d/.test(s) ? Number(s) : kanjiToNumber(s));
  let total = 0;
  let found = false;
  const hour = new RegExp(`${num}時間(半)?`).exec(t);
  if (hour) {
    const v = val(hour[1]);
    if (v !== null) {
      total += v * 3600 + (hour[2] ? 1800 : 0);
      found = true;
    }
  }
  const rest = hour ? t.slice(hour.index + hour[0].length) : t;
  const min = new RegExp(`${num}(?:分|ふん|ぷん)(半)?`).exec(rest);
  if (min) {
    const v = val(min[1]);
    if (v !== null) {
      total += v * 60 + (min[2] ? 30 : 0);
      found = true;
    }
  }
  const sec = new RegExp(`${num}(?:秒|びょう)`).exec(rest);
  if (sec) {
    const v = val(sec[1]);
    if (v !== null) {
      total += v;
      found = true;
    }
  }
  if (!found && /^.*半時間$/.test(t)) return 1800;
  return found && total > 0 && total <= MAX_SECONDS ? Math.round(total) : null;
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/**
 * 話した言葉から、コマンドを読み取る。当てはまらなければ null(まわりの話し声は、動かさない)。
 * 迷うときは、止める・のこり、を先にする(アラームを、すぐ止められるように)。
 */
export function parseVoiceCommand(raw: string): VoiceCommand | null {
  const t = toHiragana(raw.normalize("NFKC")).replace(/[\s　、。,.!?！？]/g, "");
  if (!t) return null;

  if (has(t, ["とめて", "止めて", "すとっぷ", "やめて", "けして", "消して", "とめる", "止める", "うるさい"])) return { type: "stopTimers" };
  if (has(t, ["あとなんぷん", "あと何分", "あとなんびょう", "あと何秒", "のこり", "残り", "あとどれくらい", "あとどのくらい", "あとどれぐらい"])) return { type: "remaining" };

  const seconds = parseDuration(raw);
  const timerWord = has(t, ["たいまー", "タイマー", "はかって", "計って", "測って", "せっと", "かうんと"]);
  if (timerWord) return { type: "timer", seconds: seconds ?? undefined };

  if (has(t, ["よんで", "読んで", "もういっかい", "もう一回", "もう一度", "もういちど", "くりかえ", "繰り返", "りぴーと", "よみあげ", "読み上げ", "なんだっけ", "何だっけ"])) return { type: "read" };
  if (has(t, ["ざいりょう", "材料"])) return { type: "ingredients" };
  if (has(t, ["まえ", "前", "もどる", "戻", "ばっく", "ひとつまえ"])) return { type: "prev" };
  if (has(t, ["つぎ", "次", "すすむ", "すすん", "進", "ねくすと", "できた", "おわった", "終わった", "おっけー"])) return { type: "next" };
  return null;
}
