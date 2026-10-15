"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSyncState,
  getSyncState,
  subscribeSync,
  type SyncState,
} from "@/lib/sync";

/** 同期の状態(ログイン中か、同期済みか、送れていない変更があるか)を返す */
export function useSync(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState);
}
