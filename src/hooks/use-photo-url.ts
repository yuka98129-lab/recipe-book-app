"use client";

import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo";
import { useSync } from "./use-sync";

export type PhotoUrlState = { status: "none" | "loading" | "ready" | "failed"; url: string | null };

type Result = { key: string; url: string | null };

/**
 * 写真の表示用URLを返す。ログイン前や通信できないときは failed。
 * ログイン状態が変わったら、取り直す。
 */
export function usePhotoUrl(path: string | undefined): PhotoUrlState {
  const sync = useSync();
  const signedIn =
    sync.status === "idle" || sync.status === "syncing" || sync.status === "error";
  const key = path && signedIn ? path : "";
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getPhotoUrl(key).then((url) => {
      if (!cancelled) setResult({ key, url });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!path) return { status: "none", url: null };
  // ログイン状態の確認中は「読み込み中」、確認できてログインしていなければ「表示できない」
  if (!signedIn) {
    return { status: sync.status === "loading" ? "loading" : "failed", url: null };
  }
  if (!result || result.key !== key) return { status: "loading", url: null };
  return result.url ? { status: "ready", url: result.url } : { status: "failed", url: null };
}
