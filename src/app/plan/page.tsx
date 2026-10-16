import { MealCalendar } from "@/components/MealCalendar";

export const metadata = { title: "献立カレンダー | レシピ帳" };

export default function PlanPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">献立カレンダー</h1>
      <MealCalendar />
    </div>
  );
}
