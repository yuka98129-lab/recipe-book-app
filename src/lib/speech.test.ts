import { describe, expect, it } from "vitest";
import { getSpeechRecognitionCtor, joinTranscript, speechErrorMessage } from "./speech";

describe("getSpeechRecognitionCtor", () => {
  it("SpeechRecognition か webkitSpeechRecognition があれば返す。なければ null", () => {
    class A {}
    class B {}
    expect(getSpeechRecognitionCtor({ SpeechRecognition: A })).toBe(A);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: B })).toBe(B);
    expect(getSpeechRecognitionCtor({})).toBeNull();
    expect(getSpeechRecognitionCtor(undefined)).toBeNull();
  });
});

describe("joinTranscript", () => {
  it("うしろにつなぐ。空の入力は何もしない", () => {
    expect(joinTranscript("", "卵3個", 100)).toBe("卵3個");
    expect(joinTranscript("卵3個 ", " 玉ねぎ1個 ", 100)).toBe("卵3個 玉ねぎ1個");
    expect(joinTranscript("卵3個", "  ", 100)).toBe("卵3個");
  });
  it("上限を超える分は切る", () => {
    expect(joinTranscript("あいう", "えおかき", 5)).toBe("あいう え");
  });
});

describe("speechErrorMessage", () => {
  it("話さなかった・自分で止めた場合は、エラーとして見せない", () => {
    expect(speechErrorMessage("no-speech")).toBeNull();
    expect(speechErrorMessage("aborted")).toBeNull();
  });
  it("許可がない・マイクがないなどは、やさしい日本語で返す", () => {
    expect(speechErrorMessage("not-allowed")).toContain("マイク");
    expect(speechErrorMessage("audio-capture")).toContain("マイク");
    expect(speechErrorMessage("network")).toContain("通信");
    expect(speechErrorMessage("something-new")).toContain("もう一度");
  });
});
