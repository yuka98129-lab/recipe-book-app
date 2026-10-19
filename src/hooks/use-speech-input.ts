"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSpeechRecognitionCtor, speechErrorMessage, type SpeechRecognitionLike } from "@/lib/speech";

/** 止まってしまったとき、自動でつなぎ直す回数の上限(無限に続けないため) */
const MAX_RESTARTS = 30;

/**
 * 声を文字にする。話し終わった(確定した)ぶんだけ onFinal に渡し、確定前のぶんは interim に出す。
 * ブラウザが勝手に止めても、「止める」を押すまでは、つなぎ直す。
 */
export function useSpeechInput(onFinal: (text: string) => void) {
  // サーバー側の描画と食い違わないよう、対応しているかは、画面が出てから調べる(最初は「未対応」)
  const supported = useSyncExternalStore(
    () => () => {},
    () => getSpeechRecognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const restartsRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setError("");
    wantRef.current = true;
    restartsRef.current = 0;

    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) onFinalRef.current(finalText);
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      const msg = speechErrorMessage(e.error);
      if (msg) {
        setError(msg);
        wantRef.current = false; // 許可がないなどは、つなぎ直しても同じ
      }
    };
    rec.onend = () => {
      setInterim("");
      if (wantRef.current && restartsRef.current < MAX_RESTARTS) {
        restartsRef.current += 1;
        try {
          rec.start();
          return;
        } catch {
          // つなぎ直せなければ、ここで終わりにする
        }
      }
      wantRef.current = false;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      wantRef.current = false;
      setError("声の入力を始められませんでした。もう一度試してください。");
    }
  }, []);

  // 画面を離れるときは止める
  useEffect(() => {
    return () => {
      wantRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  return { supported, listening, interim, error, start, stop };
}
