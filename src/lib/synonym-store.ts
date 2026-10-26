import { buildSynonymIndex, cleanGroup, DEFAULT_SYNONYMS, MAX_USER_GROUPS, type SynonymGroup, type SynonymIndex } from "./synonyms";

// 自分で足した「材料の言い換え」。この端末の localStorage にだけ保存する(同期はしない)。

export const SYNONYMS_KEY = "synonyms:v1";

const EMPTY: SynonymGroup[] = [];
let cache: SynonymGroup[] | null = null;
let indexCache: { source: SynonymGroup[]; index: SynonymIndex } | null = null;
const listeners = new Set<() => void>();

function load(): SynonymGroup[] {
  try {
    const raw = localStorage.getItem(SYNONYMS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanGroup).filter((g): g is SynonymGroup => g !== null).slice(0, MAX_USER_GROUPS);
  } catch {
    return [];
  }
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SYNONYMS_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const getSnapshot = (): SynonymGroup[] => (cache ??= load());
export const getServerSnapshot = (): SynonymGroup[] => EMPTY;

export class SynonymStoreError extends Error {}

function save(next: SynonymGroup[]) {
  try {
    localStorage.setItem(SYNONYMS_KEY, JSON.stringify(next));
  } catch {
    throw new SynonymStoreError("保存できませんでした。ブラウザの保存容量またはプライバシー設定を確認してください。");
  }
  cache = next;
  listeners.forEach((l) => l());
}

/** 言い換えを1組足す。足せないとき(2つ未満・多すぎる)は、理由を返す。足せたら null */
export function addGroup(words: SynonymGroup | null): string | null {
  if (!words) return "同じ材料の呼び方を、2つ以上、「、」で区切って入れてください(例: 白滝、しらたき、糸こんにゃく)。";
  const current = getSnapshot();
  if (current.length >= MAX_USER_GROUPS) return `言い換えは、${MAX_USER_GROUPS}組までです。いらないものを消してください。`;
  save([...current, words]);
  return null;
}

export function removeGroup(index: number) {
  const current = getSnapshot();
  if (index < 0 || index >= current.length) return;
  save(current.filter((_, i) => i !== index));
}

/** 標準+自分で足した言い換えの索引(中身が変わらない間は、同じものを返す) */
export function getIndex(): SynonymIndex {
  const user = getSnapshot();
  if (!indexCache || indexCache.source !== user) {
    indexCache = { source: user, index: buildSynonymIndex([...DEFAULT_SYNONYMS, ...user]) };
  }
  return indexCache.index;
}
