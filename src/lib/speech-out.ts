// 声で読み上げる(ブラウザの音声合成)。使えないブラウザでは、何もしない。

type Synth = {
  speak(u: unknown): void;
  cancel(): void;
};
type UtteranceCtor = new (text: string) => { lang: string; rate: number; onend: (() => void) | null; onerror: (() => void) | null };

function env(): { synth: Synth; Utterance: UtteranceCtor } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { speechSynthesis?: Synth; SpeechSynthesisUtterance?: UtteranceCtor };
  return w.speechSynthesis && w.SpeechSynthesisUtterance ? { synth: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance } : null;
}

export const canSpeak = () => env() !== null;

/** 読み上げる。読み終わったら(失敗しても)onEnd を呼ぶ。前の読み上げは、止める */
export function speak(text: string, onEnd?: () => void): boolean {
  const e = env();
  if (!e || !text.trim()) {
    onEnd?.();
    return false;
  }
  try {
    e.synth.cancel();
    const u = new e.Utterance(text);
    u.lang = "ja-JP";
    u.rate = 1;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    e.synth.speak(u);
    return true;
  } catch {
    onEnd?.();
    return false;
  }
}

export function stopSpeaking() {
  try {
    env()?.synth.cancel();
  } catch {
    // 止められなくても、困らない
  }
}
