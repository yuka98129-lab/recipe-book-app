// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { POST } from "./route";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
let userSeq = 0;

function req(body: unknown, token: string | null = "tok") {
  return new Request("http://localhost/api/extract-recipe", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: `u${++userSeq}` } }, error: null }));
  create.mockReset().mockResolvedValue({
    content: [{ type: "tool_use", id: "t", name: "record_recipe", input: { name: "みそ汁", ingredients: [{ name: "豆腐", quantity: "1丁" }], steps: ["煮る"] } }],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/extract-recipe", () => {
  it("設定が足りなければ 503(鍵がなくても落ちない)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(req({ images: [JPEG], text: "", categories: [] }))).status).toBe(503);
  });

  it("ログインしていなければ 401(AI は呼ばない)", async () => {
    expect((await POST(req({ images: [JPEG] }, null))).status).toBe(401);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("bad") });
    expect((await POST(req({ images: [JPEG] }, "bad"))).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("入力が足りない・多すぎる場合は 400", async () => {
    expect((await POST(req({ images: [], text: "短い", categories: [] }))).status).toBe(400);
    expect((await POST(req({ images: [JPEG, JPEG, JPEG, JPEG] }))).status).toBe(400);
    expect((await POST(req({ images: [], text: "あ".repeat(8001) }))).status).toBe(400);
    expect((await POST(req("{not json"))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("大きすぎる写真は 413", async () => {
    const big = "data:image/jpeg;base64," + "A".repeat(2_600_000);
    expect((await POST(req({ images: [big] }))).status).toBe(413);
  });

  it("正常なら読み取り結果を返す", async () => {
    const res = await POST(req({ images: [JPEG], text: "", categories: ["汁物"] }));
    expect(res.status).toBe(200);
    expect((await res.json()).recipe.name).toBe("みそ汁");
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "record_recipe" });
  });

  it("AI のエラー詳細は利用者に返さない(502)", async () => {
    create.mockRejectedValueOnce(new Error("invalid x-api-key sk-secret"));
    const res = await POST(req({ images: [JPEG] }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk-secret");
  });

  it("読み取れなければ 422", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "x" }] });
    expect((await POST(req({ images: [JPEG] }))).status).toBe(422);
  });

  it("同じ人が続けて21回目は 429", async () => {
    getUser.mockImplementation(async () => ({ data: { user: { id: "same-user" } }, error: null }));
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(req({ images: [JPEG] }))).status;
    expect(last).toBe(429);
    expect(create).toHaveBeenCalledTimes(20);
  });
});
