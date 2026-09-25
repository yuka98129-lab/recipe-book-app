"use client";

import { useRef, useState } from "react";
import { useRecipes } from "@/hooks/use-recipes";
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from "@/lib/backup";
import { StorageError, importBackup, type ImportMode } from "@/lib/recipe-store";

type Notice = { kind: "error" | "success"; text: string };
type Pending = { backup: BackupFile; fileName: string };

// スマホでは横幅いっぱいにして押しやすくする
const baseButton = "w-full rounded-md border px-4 py-2.5 text-sm disabled:opacity-40 sm:w-auto";
const buttonClass = `${baseButton} border-stone-300 bg-white hover:bg-stone-50`;
const primaryButtonClass = `${baseButton} border-orange-600 bg-orange-600 text-white hover:bg-orange-700`;
const dangerButtonClass = `${baseButton} border-red-600 bg-red-600 text-white hover:bg-red-700`;

function formatExportedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP");
}

/** レシピのバックアップ(書き出し)と復元(読み込み)。データはこのブラウザの外には送らない */
export function BackupPanel() {
  const { recipes, categories, ready } = useRecipes();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const hasRecipes = ready && recipes.length > 0;

  function handleExport() {
    const fileName = backupFileName();
    const blob = new Blob([serializeBackup(createBackup(recipes, categories))], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({
      kind: "success",
      text: `${recipes.length}件のレシピを「${fileName}」として書き出しました。`,
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルをもう一度選んでも読み込めるようにする
    setPending(null);
    setConfirmReplace(false);
    setNotice(null);
    if (!file) return;

    if (file.size > MAX_BACKUP_BYTES) {
      setNotice({ kind: "error", text: "ファイルが大きすぎます(上限は5MBです)。" });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ kind: "error", text: "ファイルを読み込めませんでした。" });
      return;
    }

    const result = parseBackup(text);
    if (!result.ok) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    if (result.backup.recipes.length === 0) {
      // 空のファイルで「上書き」して、全レシピを消してしまう事故を防ぐ
      setNotice({ kind: "error", text: "このバックアップファイルにはレシピが入っていません。" });
      return;
    }
    setPending({ backup: result.backup, fileName: file.name });
  }

  function apply(mode: ImportMode) {
    if (!pending) return;
    try {
      const { added, skipped } = importBackup(pending.backup, mode);
      setNotice({
        kind: "success",
        text:
          mode === "replace"
            ? `${added}件のレシピで置き換えました。`
            : skipped > 0
              ? `${added}件を追加しました(${skipped}件は登録済みのためスキップしました)。`
              : `${added}件を追加しました。`,
      });
      setPending(null);
      setConfirmReplace(false);
    } catch (err) {
      setNotice({
        kind: "error",
        text:
          err instanceof StorageError
            ? err.message
            : "読み込みに失敗しました。いまのデータは変更されていません。",
      });
    }
  }

  const exportedAt = pending ? formatExportedAt(pending.backup.exportedAt) : "";
  const previewNames = pending?.backup.recipes.slice(0, 5).map((r) => r.name) ?? [];

  return (
    <section aria-labelledby="backup-heading" className="mt-10 border-t border-stone-200 pt-6">
      <h2 id="backup-heading" className="text-base font-semibold">
        バックアップ
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        レシピはこのブラウザにだけ保存されています。ファイルに書き出しておくと、ブラウザのデータを消してしまったときや、別の端末・ブラウザへ移すときに復元できます。
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={handleExport} disabled={!hasRecipes} className={buttonClass}>
          データを書き出す(エクスポート)
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={!ready}
          className={buttonClass}
        >
          データを読み込む(インポート)
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          aria-label="バックアップファイルを選択"
          className="hidden"
        />
      </div>
      {ready && !hasRecipes && (
        <p className="mt-2 text-xs text-stone-500">書き出せるレシピがまだありません。</p>
      )}

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
          }`}
        >
          {notice.text}
        </p>
      )}

      {pending && (
        <div className="mt-4 space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
          <div>
            <p className="font-medium break-words">
              「{pending.fileName}」から {pending.backup.recipes.length}件のレシピを読み込みます。
            </p>
            {exportedAt && <p className="text-xs text-stone-600">書き出した日時: {exportedAt}</p>}
            <p className="mt-1 text-xs text-stone-600 break-words">
              {previewNames.join("、")}
              {pending.backup.recipes.length > previewNames.length && " ほか"}
            </p>
          </div>

          {!hasRecipes ? (
            <button type="button" onClick={() => apply("add")} className={primaryButtonClass}>
              読み込む
            </button>
          ) : confirmReplace ? (
            <div className="space-y-2">
              <p className="text-red-700">
                いまの{recipes.length}件のレシピは削除され、ファイルの
                {pending.backup.recipes.length}件に置き換わります。元に戻せません。よろしいですか?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => apply("replace")}
                  className={dangerButtonClass}
                >
                  置き換える
                </button>
                <button type="button" onClick={() => setConfirmReplace(false)} className={buttonClass}>
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <button type="button" onClick={() => apply("add")} className={primaryButtonClass}>
                  追加する
                </button>
                <p className="mt-1 text-xs text-stone-600">
                  いまのレシピは残し、ファイルのレシピを加えます。登録済みの同じレシピは重複しません。
                </p>
              </div>
              <div>
                <button type="button" onClick={() => setConfirmReplace(true)} className={buttonClass}>
                  上書きする
                </button>
                <p className="mt-1 text-xs text-stone-600">
                  いまのレシピをすべて、ファイルの内容に置き換えます。
                </p>
              </div>
            </div>
          )}

          {!confirmReplace && (
            <button
              type="button"
              onClick={() => setPending(null)}
              className="py-2 text-sm text-stone-600 underline"
            >
              キャンセル
            </button>
          )}
        </div>
      )}
    </section>
  );
}
