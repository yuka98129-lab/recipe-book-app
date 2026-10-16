import { Suspense } from "react";
import { RecipeBrowser } from "@/components/RecipeBrowser";

export default function Home() {
  return (
    <Suspense>
      <RecipeBrowser />
    </Suspense>
  );
}
