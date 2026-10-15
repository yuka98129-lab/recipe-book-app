"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync";

/** どの画面を開いても同期が動くように、アプリ全体で1回だけ同期を始める(画面には何も表示しない) */
export function SyncBootstrap() {
  useEffect(() => {
    startSync();
  }, []);
  return null;
}
