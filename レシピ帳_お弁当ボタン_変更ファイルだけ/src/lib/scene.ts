// 「ふだんのおかず」と「お弁当」の使い分け。
// Recipe.bento が無いレシピは、ふだんのおかず用。"both" はお弁当にも使える(兼用)、"only" はお弁当用(ふだんの一覧には出さない)。

export type Bento = "both" | "only";
/** 一覧の絞り込み。"" はすべて */
export type Scene = "" | "daily" | "bento";
/** 登録画面の選択肢(daily は、お弁当ではない) */
export type BentoChoice = "daily" | Bento;

export const isBento = (v: unknown): v is Bento => v === "both" || v === "only";
export const parseBento = (v: unknown): Bento | undefined => (isBento(v) ? v : undefined);
export const parseScene = (v: string | null | undefined): Scene => (v === "daily" || v === "bento" ? v : "");

export const choiceOf = (b: Bento | undefined): BentoChoice => b ?? "daily";
export const bentoOf = (c: BentoChoice): Bento | undefined => (c === "daily" ? undefined : c);

/** そのレシピが、その場面の一覧に出るか */
export function inScene(r: { bento?: Bento }, scene: Scene): boolean {
  if (scene === "daily") return r.bento !== "only";
  if (scene === "bento") return r.bento !== undefined;
  return true;
}

export const SCENES: readonly { id: Scene; label: string }[] = [
  { id: "", label: "すべて" },
  { id: "daily", label: "ふだんのおかず" },
  { id: "bento", label: "お弁当" },
];

export const BENTO_CHOICES: readonly { id: BentoChoice; label: string; note: string }[] = [
  { id: "daily", label: "ふだんのおかず", note: "お弁当には入れない" },
  { id: "both", label: "どちらにも使える", note: "ふだんのおかずにも、お弁当にもなる" },
  { id: "only", label: "お弁当用", note: "お弁当のときだけ。ふだんの一覧には出ない" },
];

/** お弁当にするときの、用途タグの候補(自由に入れられる) */
export const BENTO_TAGS = ["冷めてもおいしい", "作りおき", "汁けなし"];

export const bentoLabel = (b: Bento | undefined): string | null => (b === "both" ? "お弁当にも" : b === "only" ? "お弁当用" : null);
