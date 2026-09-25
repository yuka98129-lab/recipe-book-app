"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type StoreSnapshot,
} from "@/lib/recipe-store";

const noopSubscribe = () => () => {};

/**
 * ストアの内容と、localStorage を読み終えたか(ready)を返す。
 * サーバー描画/ハイドレーション中は ready=false で、空データが返る。
 */
export function useRecipes(): StoreSnapshot & { ready: boolean } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return { ...snapshot, ready };
}
