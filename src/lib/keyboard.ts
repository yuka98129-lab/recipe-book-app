type KeyLike = {
  key: string;
  keyCode: number;
  nativeEvent: { isComposing: boolean };
};

/**
 * 「行を追加する」など、操作としての Enter かどうか。
 * 日本語入力(IME)の変換を確定する Enter は含めない。
 * - Chrome など: 変換中の keydown は isComposing が true
 * - Safari: 確定の keydown は compositionend の後に届き、isComposing が false でも keyCode は 229
 */
export function isPlainEnter(e: KeyLike): boolean {
  return e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;
}
