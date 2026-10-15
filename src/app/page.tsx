import { Suspense } from "react";
import { BackupPanel } from "@/components/BackupPanel";
import { RecipeBrowser } from "@/components/RecipeBrowser";
import { SyncPanel } from "@/components/SyncPanel";

export default function Home() {
  return (
    <>
      <Suspense>
        <RecipeBrowser />
      </Suspense>
      {/* 同期の設定がないときは何も表示しない */}
      <SyncPanel />
      {/* レシピが0件でも表示する(空の状態からバックアップを復元できるように) */}
      <BackupPanel />
    </>
  );
}
