"use client";

import { useState } from "react";
import { useSync } from "@/hooks/use-sync";
import { signIn, signOut, syncNow } from "@/lib/sync";

const baseButton = "w-full rounded-md border px-4 py-2.5 text-sm disabled:opacity-40 sm:w-auto";
const buttonClass = `${baseButton} border-stone-300 bg-white hover:bg-stone-50`;
const primaryButtonClass = `${baseButton} border-orange-600 bg-orange-600 text-white hover:bg-orange-700`;
const inputClass =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-base sm:max-w-sm sm:text-sm";

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

/** PC・スマホなど、複数の端末で同じレシピを使うための同期(ログイン)。設定がなければ表示しない */
export function SyncPanel() {
  const sync = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 設定がないとき、起動の確認中は何も出さない(設定がないアプリで、一瞬だけ表示が出るのを防ぐ)
  if (sync.status === "disabled" || sync.status === "loading") return null;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else setPassword("");
  }

  const signedIn = sync.status === "idle" || sync.status === "syncing" || sync.status === "error";

  return (
    <section aria-labelledby="sync-heading" className="mt-10 border-t border-stone-200 pt-6">
      <h2 id="sync-heading" className="text-base font-semibold">
        ほかの端末と同期する
      </h2>

      {sync.status === "signed-out" && (
        <>
          <p className="mt-1 text-sm text-stone-600">
            ログインすると、レシピがクラウドにも保存され、PCでもスマホでも同じレシピを見られます。いまこの端末にあるレシピは、初めてログインしたときにクラウドへ送られます。
          </p>
          <form onSubmit={handleSignIn} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-stone-700">メールアドレス</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-700">パスワード</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? "ログインしています…" : "ログイン"}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}

      {signedIn && (
        <div className="mt-2 space-y-3 text-sm">
          <p className="break-words text-stone-700">ログイン中: {sync.email}</p>
          <p
            role="status"
            className={sync.status === "error" ? "text-red-700" : "text-stone-600"}
          >
            {sync.status === "syncing" && "同期しています…"}
            {sync.status === "idle" &&
              (sync.pendingCount > 0
                ? `まだクラウドに送れていない変更が${sync.pendingCount}件あります。`
                : `同期済みです${sync.lastSyncedAt ? `(${formatTime(sync.lastSyncedAt)})` : ""}。`)}
            {sync.status === "error" && (sync.message ?? "同期できませんでした。")}
          </p>
          {sync.status === "error" && sync.pendingCount > 0 && (
            <p className="text-xs text-stone-600">
              送れていない変更が{sync.pendingCount}件あります。この端末には保存されているので、消えることはありません。
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={sync.status === "syncing"}
              className={buttonClass}
            >
              今すぐ同期
            </button>
            <button type="button" onClick={() => void signOut()} className={buttonClass}>
              ログアウト
            </button>
          </div>
          <p className="text-xs text-stone-500">
            ログアウトしても、この端末のレシピは消えません。
          </p>
        </div>
      )}
    </section>
  );
}
