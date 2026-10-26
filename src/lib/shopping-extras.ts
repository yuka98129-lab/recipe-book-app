// 「買い忘れメモ」: ゴミ袋・ティッシュなど、スーパーで買えるものを、いつでもメモしておく。
// 献立の買い物リストとは別の枠で、この端末の localStorage にだけ保存する。
// 冷蔵庫さがしの「足りない材料」も、ここに入れられる。

const KEY = "shopping:extras:v1";
export const MAX_EXTRAS = 100;
export const MAX_EXTRA_LENGTH = 30;

export type MemoItem = { name: string; /** 買えた(チェック済み) */ done: boolean };

const EMPTY: MemoItem[] = [];
let cache: MemoItem[] | null = null;
const listeners = new Set<() => void>();

const keyOf = (name: string) => name.toLowerCase();

/** 名前を整える(全角・半角、空白、長さの上限) */
export const cleanName = (x: unknown): string =>
  typeof x === "string" ? x.normalize("NFKC").replace(/[\s　]+/g, " ").trim().slice(0, MAX_EXTRA_LENGTH) : "";

/**
 * 保存された値・入力を、整える。
 * 昔の形(名前だけの文字列)も読める。名前がない・同じ名前・上限をこえた分は捨てる。
 */
export function cleanMemo(v: unknown): MemoItem[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: MemoItem[] = [];
  for (const x of v) {
    const name = cleanName(typeof x === "object" && x !== null ? (x as { name?: unknown }).name : x);
    const done = typeof x === "object" && x !== null && (x as { done?: unknown }).done === true;
    if (!name || seen.has(keyOf(name))) continue;
    seen.add(keyOf(name));
    out.push({ name, done });
    if (out.length >= MAX_EXTRAS) break;
  }
  return out;
}

function load(): MemoItem[] {
  try {
    return cleanMemo(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return EMPTY;
  }
}

function commit(list: MemoItem[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 保存できなくても、このあいだは、画面に出る
  }
  listeners.forEach((l) => l());
}

export function subscribeExtras(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
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
export const getExtrasSnapshot = (): MemoItem[] => (cache ??= load());
export const getServerExtrasSnapshot = (): MemoItem[] => EMPTY;

/** 足す。すでにあるものは、「買えた」を外して、もう一度、買うものにする */
export function addExtras(names: string[]) {
  const list = [...getExtrasSnapshot()];
  for (const raw of names) {
    const name = cleanName(raw);
    if (!name) continue;
    const i = list.findIndex((x) => keyOf(x.name) === keyOf(name));
    if (i >= 0) list[i] = { ...list[i], done: false };
    else list.push({ name, done: false });
  }
  commit(cleanMemo(list));
}
/** 「買えた」のチェックを、つけ外しする */
export const toggleExtra = (name: string) => commit(getExtrasSnapshot().map((x) => (x.name === name ? { ...x, done: !x.done } : x)));
export const removeExtra = (name: string) => commit(getExtrasSnapshot().filter((x) => x.name !== name));
/** 買えたものを、ぜんぶ消す */
export const clearDoneExtras = () => commit(getExtrasSnapshot().filter((x) => !x.done));
