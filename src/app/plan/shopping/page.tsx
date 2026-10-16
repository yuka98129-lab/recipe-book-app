import { Suspense } from "react";
import { ShoppingView } from "@/components/ShoppingView";

export const metadata = { title: "買い物リスト | レシピ帳" };

export default function ShoppingPage() {
  return (
    <Suspense>
      <ShoppingView />
    </Suspense>
  );
}
