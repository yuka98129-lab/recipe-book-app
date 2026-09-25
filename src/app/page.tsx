import { Suspense } from "react";
import { BackupPanel } from "@/components/BackupPanel";
import { RecipeBrowser } from "@/components/RecipeBrowser";

export default function Home() {
  return (
    <>
      <Suspense>
        <RecipeBrowser />
      </Suspense>
      {/* レシピが0件でも表示する(空の状態からバックアップを復元できるように) */}
      <BackupPanel />
    </>
  );
}
