import { AppearancePanel } from "@/components/AppearancePanel";
import { BackupPanel } from "@/components/BackupPanel";
import { SynonymPanel } from "@/components/SynonymPanel";
import { SyncPanel } from "@/components/SyncPanel";

export const metadata = { title: "設定 | レシピ帳" };

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">設定</h1>
      {/* 同期の設定がないときは、同期の欄は何も表示しない */}
      <SyncPanel />
      <AppearancePanel />
      <SynonymPanel />
      {/* レシピが0件でも表示する(空の状態からバックアップを復元できるように) */}
      <BackupPanel />
    </div>
  );
}
