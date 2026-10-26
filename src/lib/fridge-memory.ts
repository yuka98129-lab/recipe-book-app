import { cleanHave } from "./fridge";

// 冷蔵庫さがしで入れた材料を、この端末に覚えておく(買い物リストで「冷蔵庫にあるもの」を見分けるため)。

const KEY = "fridge:have:v1";

export function saveFridge(have: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cleanHave(have)));
  } catch {
    // 覚えておけなくても、さがす操作は続けられる
  }
}

export function loadFridge(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? cleanHave(v.filter((x): x is string => typeof x === "string")) : [];
  } catch {
    return [];
  }
}
