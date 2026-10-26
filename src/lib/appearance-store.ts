import { APPEARANCE_KEY, applyAppearance, DEFAULT_APPEARANCE, parseAppearance, type Appearance } from "./appearance";

let cache: Appearance | null = null;
const listeners = new Set<() => void>();

function load(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === APPEARANCE_KEY) {
      cache = null;
      applyAppearance(getSnapshot());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const getSnapshot = (): Appearance => (cache ??= load());
export const getServerSnapshot = (): Appearance => DEFAULT_APPEARANCE;

/** 見た目を変える。画面に、すぐ反映する(保存できなくても、このあいだは、変わる) */
export function setAppearance(patch: Partial<Appearance>) {
  const next = parseAppearance({ ...getSnapshot(), ...patch });
  cache = next;
  applyAppearance(next);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  } catch {
    // 保存できない設定(プライベートモードなど)でも、いまの画面は、変わる
  }
  listeners.forEach((l) => l());
}
