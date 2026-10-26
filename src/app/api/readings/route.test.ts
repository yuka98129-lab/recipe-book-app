// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));

import { POST } from "./route";

const good = { items: [{ id: "a", name: "親子丼" }, { id: "b", name: "麻婆豆腐" }] };
let seq = 0;
const req = (body: unknown, token: string | null = "tok") =>
  new Request("http://localhost/api/readings", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const aiOk = { content: [{ type: "tool_use", id: "t", name: "record_readings", input: { items: [{ id: "a", reading: "おやこどん" }, { id: "b", reading: "まーぼーどうふ" }] } }] };

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: `r${++seq}` } }, error: null }));
  create.mockReset().mockResolvedValue(aiOk);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/readings", () => {
  it("設定がなければ 503、ログインがなければ 401(AI は呼ばない)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(req(good))).status).toBe(503);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect((await POST(req(good, null))).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("料理名が空・形が違うときは 400", async () => {
    expect((await POST(req({ items: [{ id: "a", name: "  " }] }))).status).toBe(400);
    expect((await POST(req({ items: "x" }))).status).toBe(400);
    expect((await POST(req("{bad"))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("正常なら、よみがなを返す。送るのは、id と料理名だけ", async () => {
    const res = await POST(req({ ...good, extra: "材料など" }));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0]).toEqual({ id: "a", reading: "おやこどん" });
    const sent = JSON.stringify(create.mock.calls[0][0].messages);
    expect(sent).toContain("親子丼");
    expect(sent).not.toContain("材料など");
  });

  it("41件目以降は送らない。タブ・改行は空白にする", async () => {
    const many = { items: Array.from({ length: 60 }, (_, i) => ({ id: `i${i}`, name: `料理${i}` })) };
    await POST(req(many));
    const text = JSON.stringify(create.mock.calls[0][0].messages);
    expect(text).toContain("i39\\t料理39");
    expect(text).not.toContain("i40\\t");
    create.mockClear();
    await POST(req({ items: [{ id: "a", name: "親子\t丼\nx" }] }));
    expect(JSON.stringify(create.mock.calls[0][0].messages)).toContain("a\\t親子 丼 x");
  });

  it("AI のエラー詳細は返さない(502)。使える読みがなければ 422", async () => {
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
