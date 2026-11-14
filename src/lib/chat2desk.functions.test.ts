import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { registerChat2deskWebhook } from "./chat2desk.functions";

const register = registerChat2deskWebhook as unknown as (args: {
  context: { supabase: { rpc: () => Promise<{ data: boolean; error: null }> } };
}) => Promise<{ ok: boolean; message: string }>;
const run = () => register({ context: { supabase: { rpc: async () => ({ data: true, error: null }) } } });
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const rus02 = "https://api-rus02.chat2desk.com";
const main = "https://api.chat2desk.com";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Chat2Desk registration host selection", () => {
  it("tries the override first, falls back on 403, trims the token and creates on rus02", async () => {
    vi.stubEnv("CHAT2DESK_API_TOKEN", " \n\"synthetic-fixture\"\r\n ");
    vi.stubEnv("CHAT2DESK_API_HOST", "https://override.example/ ");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(reply(403, { errors: "Token is not correct" }))
      .mockResolvedValueOnce(reply(200, { data: [] }))
      .mockResolvedValueOnce(reply(201, {}));
    vi.stubGlobal("fetch", fetcher);
    const result = await run();
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "https://override.example/v1/webhooks", `${rus02}/v1/webhooks`, `${rus02}/v1/webhooks`,
    ]);
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe("synthetic-fixture");
    expect(fetcher.mock.calls[2]?.[1].method).toBe("POST");
    expect(result.ok).toBe(true);
    expect(result.message).toContain(rus02);
  });

  it("falls back from rus02 to the main host and updates on that same host", async () => {
    vi.stubEnv("CHAT2DESK_API_TOKEN", "synthetic-fixture");
    vi.stubEnv("CHAT2DESK_API_HOST", "");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(reply(403, { errors: "Token is not correct" }))
      .mockResolvedValueOnce(reply(200, { data: [{ id: 42, name: "Nova CRM" }] }))
      .mockResolvedValueOnce(reply(200, {}));
    vi.stubGlobal("fetch", fetcher);
    expect((await run()).ok).toBe(true);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      `${rus02}/v1/webhooks`, `${main}/v1/webhooks`, `${main}/v1/webhooks/42`,
    ]);
    expect(fetcher.mock.calls[2]?.[1].method).toBe("PUT");
  });

  it("stops on the first non-403 error", async () => {
    vi.stubEnv("CHAT2DESK_API_TOKEN", "synthetic-fixture");
    vi.stubEnv("CHAT2DESK_API_HOST", "");
    const fetcher = vi.fn().mockResolvedValue(reply(500, { errors: "Server unavailable" }));
    vi.stubGlobal("fetch", fetcher);
    expect((await run()).ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports every rejected host with status and short errors, without exposing the token", async () => {
    vi.stubEnv("CHAT2DESK_API_TOKEN", "synthetic-fixture");
    vi.stubEnv("CHAT2DESK_API_HOST", "");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply(403, { errors: "Token is not correct: synthetic-fixture" })));
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`${rus02} — код 403: Token is not correct`);
    expect(result.message).toContain(`${main} — код 403: Token is not correct`);
    expect(result.message).not.toContain("synthetic-fixture");
  });

  it("does not return long provider errors", async () => {
    vi.stubEnv("CHAT2DESK_API_TOKEN", "synthetic-fixture");
    vi.stubEnv("CHAT2DESK_API_HOST", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(400, { errors: "private-body".repeat(30) })));
    expect((await run()).message).not.toContain("private-body");
  });
});