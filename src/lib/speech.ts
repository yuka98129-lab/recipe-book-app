// 声で入力する(ブラウザの音声認識)ための小さな道具。画面のない部分だけをここに置いて、テストできるようにする。

export type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
export type SpeechEventLike = { resultIndex: number; results: { length: number; [i: number]: SpeechResultLike } };
export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** このブラウザで音声認識が使えるなら、その入口(なければ null)。Chrome・Edge・Safari で名前が違う */
export function getSpeechRecognitionCtor(w: unknown = typeof window === "undefined" ? undefined : window): SpeechRecognitionCtor | null {
  if (typeof w !== "object" || w === null) return null;
  const x = w as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return x.SpeechRecognition ?? x.webkitSpeechRecognition ?? null;
}

/** 話した言葉を、いまの文章のうしろにつなぐ(間に空白を入れる)。上限を超える分は切る */
export function joinTranscript(base: string, addition: string, max: number): string {
  const add = addition.trim();
  if (!add) return base;
  const head = base.trimEnd();
  const joined = head ? `${head} ${add}` : add;
  return joined.slice(0, max);
}

/**
 * 音声認識のエラーを、やさしい日本語にする。
 * 「話さなかった」「自分で止めた」など、エラーとして見せなくていいものは null。
 */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "マイクが使えません。ブラウザの設定で、このサイトのマイクを「許可」にしてください。キーボードのマイクのボタンでも、声で入れられます。";
    case "audio-capture":
      return "マイクが見つかりません。マイクがつながっているか確認してください。";
    case "network":
      return "通信できず、声を文字にできませんでした。ネットワークを確認して、もう一度試してください。";
    case "language-not-supported":
      return "このブラウザでは、日本語の音声入力が使えません。キーボードのマイクのボタンをお使いください。";
    default:
      return "声を文字にできませんでした。もう一度試してください。";
  }
}
