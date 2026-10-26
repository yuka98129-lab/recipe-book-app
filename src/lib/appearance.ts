// 見た目の設定(色・文字の大きさ)。この端末の localStorage にだけ保存する。

export const APPEARANCE_KEY = "appearance:v1";

export const THEMES = [
  { id: "coral", label: "コーラル", note: "いまの色", swatch: "#ff5e57", color: "#ff5e57" },
  { id: "red", label: "赤", note: "はっきりした赤", swatch: "#c62828", color: "#e53935" },
  { id: "blue", label: "ブルー", note: "落ち着いた青", swatch: "#1d5fc7", color: "#2f7be5" },
] as const;

export const SIZES = [
  { id: "normal", label: "ふつう" },
  { id: "large", label: "大きめ" },
  { id: "xlarge", label: "とても大きい" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type SizeId = (typeof SIZES)[number]["id"];
export type Appearance = { theme: ThemeId; size: SizeId };

export const DEFAULT_APPEARANCE: Appearance = { theme: "coral", size: "normal" };

/** 保存された値を整える(壊れた値・知らない値は、初期値に) */
export function parseAppearance(raw: unknown): Appearance {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return DEFAULT_APPEARANCE;
    }
  }
  const o = (typeof v === "object" && v !== null ? v : {}) as { theme?: unknown; size?: unknown };
  return {
    theme: THEMES.some((t) => t.id === o.theme) ? (o.theme as ThemeId) : DEFAULT_APPEARANCE.theme,
    size: SIZES.some((s) => s.id === o.size) ? (o.size as SizeId) : DEFAULT_APPEARANCE.size,
  };
}

/** 画面に反映する(html の data-theme / data-size と、スマホの上のバーの色) */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement) {
  root.setAttribute("data-theme", a.theme);
  root.setAttribute("data-size", a.size);
  const color = THEMES.find((t) => t.id === a.theme)?.color;
  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  if (color && meta) meta.setAttribute("content", color);
}

/**
 * 画面が出る前に動かす、短いスクリプト(色が一瞬、初期の色で光らないように)。layout の head に入れる。
 * 上の parseAppearance と同じ約束事(知らない値は無視)を、1つの文字列にしてある。
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){var o={};try{o=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}")||{}}catch(e){}try{var T=${JSON.stringify(THEMES.map((t) => t.id))},S=${JSON.stringify(SIZES.map((s) => s.id))},C=${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.color])))};var t=T.indexOf(o.theme)>=0?o.theme:"coral",s=S.indexOf(o.size)>=0?o.size:"normal",r=document.documentElement;r.setAttribute("data-theme",t);r.setAttribute("data-size",s);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",C[t])}catch(e){}})();`;
