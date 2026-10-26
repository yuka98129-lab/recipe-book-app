"use client";

import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/synonym-store";
import { buildSynonymIndex, DEFAULT_INDEX, DEFAULT_SYNONYMS, type SynonymGroup, type SynonymIndex } from "@/lib/synonyms";

const indexFor = new WeakMap<SynonymGroup[], SynonymIndex>();

/** 自分で足した言い換えの組(設定画面用) */
export function useUserSynonyms(): SynonymGroup[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 標準+自分で足した言い換えの索引(検索・冷蔵庫さがし用)。中身が変わらない間は、同じものを返す */
export function useSynonymIndex(): SynonymIndex {
  const user = useUserSynonyms();
  if (user.length === 0) return DEFAULT_INDEX;
  let idx = indexFor.get(user);
  if (!idx) {
    idx = buildSynonymIndex([...DEFAULT_SYNONYMS, ...user]);
    indexFor.set(user, idx);
  }
  return idx;
}
