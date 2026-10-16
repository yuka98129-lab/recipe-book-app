"use client";

import { useSyncExternalStore } from "react";
import { getPlanSnapshot, getServerPlanSnapshot, subscribePlan, type PlanSnapshot } from "@/lib/plan-store";

/** 献立の一覧を返す。サーバー描画中は空(use-recipes と同じ考え方) */
export function usePlan(): PlanSnapshot {
  return useSyncExternalStore(subscribePlan, getPlanSnapshot, getServerPlanSnapshot);
}
