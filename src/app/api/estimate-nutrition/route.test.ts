// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));

import { POST } from "./route";

const ROW = { name: "卵", grams: 150, isVegetable: false, energyKcal: 228, proteinG: 18.5, fatG: 15.5, carbG: 0.5, calciumMg: 75, ironMg: 2.8, vitaminAUg: 225, vitaminCMg: 0, vitaminDUg: 6.3, note: "" };
const good = { name: "親子丼", groups: [{ title: "材料", rows: [{ name: "卵", quantity: "3個" }] }] };
let seq = 0;
const req = (body: unknown, token: string | null = "tok") =>
  new Request("http://localhost/api/estimate-nutrition", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: `n${++seq}` } }, error: null }));
  create.mockReset().mockResolvedValue({ content: [{ type: "tool_use", id: "t", name: "record_nutrition", input: { items: [ROW], assumptions: [] } }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/estimate-nutrition", () => {
  it("設定がなければ 503、ログインがなければ 401(AI は呼ばない)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(req(good))).status).toBe(503);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect((await POST(req(good, null))).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("材料が空・形が違うときは 400、大きい写真は 413", async () => {
    expect((await POST(req({ name: "x", groups: [{ title: "材料", rows: [{ name: "", quantity: "1" }] }] }))).status).toBe(400);
    expect((await POST(req({ name: "x" }))).status).toBe(400);
    expect((await POST(req("{bad"))).status).toBe(400);
    expect((await POST(req({ ...good, image: "data:image/jpeg;base64," + "A".repeat(2_600_000) }))).status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });

  it("正常なら材料ごとの推定を返す", async () => {
    const res = await POST(req(good));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].name).toBe("卵");
  });

  it("AI のエラー詳細は返さない(502)。読み取れなければ 422", async () => {
    create.mockRejectedValueOnce(new Error("invalid x-api-key sk-secret"));
    const r1 = await POST(req(good));
    expect(r1.status).toBe(502);
    expect(JSON.stringify(await r1.json())).not.toContain("sk-secret");
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "x" }] });
    expect((await POST(req(good))).status).toBe(422);
  });

  it("同じ人の21回目は 429", async () => {
    getUser.mockImplementation(async () => ({ data: { user: { id: "same" } }, error: null }));
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(req(good))).status;
    expect(last).toBe(429);
    expect(create).toHaveBeenCalledTimes(20);
  });
});
