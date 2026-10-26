// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));

import { POST } from "./route";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
let seq = 0;
const req = (body: unknown, token: string | null = "tok") =>
  new Request("http://localhost/api/read-fridge", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const aiOk = { content: [{ type: "tool_use", id: "t", name: "record_fridge", input: { items: [{ name: "キャベツ", sure: true, seasoning: false }], notes: [] } }] };

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: `f${++seq}` } }, error: null }));
  create.mockReset().mockResolvedValue(aiOk);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/read-fridge", () => {
  it("設定がなければ 503、ログインがなければ 401(AI は呼ばない)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(req({ images: [JPEG] }))).status).toBe(503);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect((await POST(req({ images: [JPEG] }, null))).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("写真なし・4枚以上・形が違う・大きすぎるときは断る", async () => {
    expect((await POST(req({ images: [] }))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req("{bad"))).status).toBe(400);
    expect((await POST(req({ images: [JPEG, JPEG, JPEG, JPEG] }))).status).toBe(400);
    expect((await POST(req({ images: [5] }))).status).toBe(413);
    expect((await POST(req({ images: ["data:image/jpeg;base64," + "A".repeat(2_600_000)] }))).status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });

  it("正常なら、材料を返す", async () => {
    const res = await POST(req({ images: [JPEG] }));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].name).toBe("キャベツ");
  });

  it("AI のエラー詳細は返さない(502)。材料が見つからなければ 422", async () => {
    create.mockRejectedValueOnce(new Error("invalid x-api-key sk-secret"));
    const r1 = await POST(req({ images: [JPEG] }));
    expect(r1.status).toBe(502);
    expect(JSON.stringify(await r1.json())).not.toContain("sk-secret");
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "x" }] });
    expect((await POST(req({ images: [JPEG] }))).status).toBe(422);
  });

  it("同じ人の21回目は 429", async () => {
    getUser.mockImplementation(async () => ({ data: { user: { id: "same-f" } }, error: null }));
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(req({ images: [JPEG] }))).status;
    expect(last).toBe(429);
    expect(create).toHaveBeenCalledTimes(20);
  });
});
