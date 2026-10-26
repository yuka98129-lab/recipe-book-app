import { parseFridgeReading, type FridgeReading } from "./fridge-reader";
import { ReadRequestError } from "./recipe-reader-client";
import { getSupabase } from "./supabase";

// ブラウザ側:冷蔵庫の写真をサーバー(/api/read-fridge)へ送り、読み取った材料(下書き)を受け取る。

export async function requestFridgeReading(images: string[]): Promise<FridgeReading> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new ReadRequestError("写真の読み取りは、ログインしているときに使えます。");

  let res: Response;
  try {
    res = await fetch("/api/read-fridge", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ images }),
    });
  } catch {
    throw new ReadRequestError("通信できませんでした。ネットワークを確認して、もう一度試してください。");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "読み取りに失敗しました。";
    throw new ReadRequestError(message);
  }
  const reading = parseFridgeReading(body);
  if (reading.items.length === 0) throw new ReadRequestError("材料を読み取れませんでした。撮り直してください。");
  return reading;
}
