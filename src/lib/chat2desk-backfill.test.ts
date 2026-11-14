import { afterEach, describe, expect, it, vi } from "vitest";
import { runBackfillChunk, type BackfillJob, type BackfillStore, type BackfillEvent } from "./chat2desk-backfill.server";
import { messengerReport } from "./chat2desk";

const initial = (): BackfillJob => ({ id: "fixture", from_date: "2026-11-01", to_date: "2026-11-02", phase: "anchor", cursor_start_id: null, clients_offset: 0, api_calls: 0, requests_imported: 0, clients_imported: 0, status: "running", error: null, api_host: null });
const message = (id: number, request_id: number | null, created = "2026-11-01T09:52:17 UTC") => ({ id, request_id, client_id: 8, channel_id: 2, transport: "telegram", type: "from_client", created, text: "DO NOT STORE", attachments: ["DO NOT STORE"] });
const response = (data: unknown[], total?: number) => new Response(JSON.stringify({ data, meta: { total } }), { status: 200 });
function memory() {
  const events = new Map<number, BackfillEvent>();
  const clients: unknown[] = [];
  let saved = initial();
  const store: BackfillStore = {
    save: async job => { saved = { ...job }; },
    page: async (job, rows, contacts) => {
      let added = 0;
      for (const row of rows) if (!events.has(row.request_id)) { events.set(row.request_id, row); added++; }
      clients.push(...contacts);
      saved = { ...job, requests_imported: job.requests_imported + added, clients_imported: job.clients_imported + contacts.length };
      return saved;
    },
    finish: async job => { saved = { ...job, status: "done" }; return saved; },
  };
  return { store, events, clients, saved: () => saved };
}
afterEach(() => vi.unstubAllGlobals());
describe("Chat2Desk history chunks", () => {
  it("imports each request once across pages, strips content, enriches clients and counts all API calls", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: "Token is not correct" }), { status: 403 }))
      .mockResolvedValueOnce(response([message(10, 71)]))
      .mockResolvedValueOnce(response([message(10, 71), message(11, 71), message(12, null)]))
      .mockResolvedValueOnce(response([message(13, 71), message(14, 72), message(15, 73, "2026-11-02T18:00:00 UTC")]))
      .mockResolvedValueOnce(response([{ id: 8, assigned_name: "Fixture", client_phone: "+996 555 000 001", phone: "[tg] 8", private: "DO NOT STORE" }], 1));
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    const result = await runBackfillChunk(initial(), db.store, " \"fixture-token\"\n");
    expect(result.status).toBe("done");
    expect(result.api_calls).toBe(5);
    expect(result.requests_imported).toBe(2);
    expect(result.clients_imported).toBe(1);
    expect(db.events.get(71)?.event_time).toBe("2026-11-01T09:52:17.000Z");
    expect(JSON.stringify([...db.events.values(), ...db.clients])).not.toContain("DO NOT STORE");
    expect(fetcher.mock.calls[2]?.[0]).toContain("api.chat2desk.com/v1/messages");
    expect(fetcher.mock.calls[3]?.[0]).toContain("start_id=13");
    expect(fetcher.mock.calls[4]?.[0]).toContain("created_after=1793469600");
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe("fixture-token");
  });

  it("caps calls per invocation and resumes from the committed cursor", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const cursor = Number(new URL(url).searchParams.get("start_id"));
      return response([message(cursor, cursor)]);
    });
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    const job = { ...initial(), phase: "messages", cursor_start_id: 1, api_host: "https://api-rus02.chat2desk.com" };
    const first = await runBackfillChunk(job, db.store, "fixture-token");
    expect(first.api_calls).toBe(18);
    expect(first.cursor_start_id).toBe(19);
    const second = await runBackfillChunk(first, db.store, "fixture-token");
    expect(second.api_calls).toBe(36);
    expect(second.requests_imported).toBe(36);
    expect(fetcher.mock.calls[18]?.[0]).toContain("start_id=19");
  });

  it("counts failed attempts without advancing a page cursor and stops on non-403", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: "Server unavailable" }), { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    await expect(runBackfillChunk(initial(), db.store, "fixture-token")).rejects.toThrow("код 500");
    expect(db.saved().api_calls).toBe(1);
    expect(db.saved().cursor_start_id).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("finishes after an empty anchor without client API calls", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    expect((await runBackfillChunk(initial(), db.store, "fixture-token")).status).toBe("done");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts the cluster's dd-mm-yyyy date format after a clear format rejection", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: "invalid start_date. Supported format: dd-mm-yyyy." }), { status: 400 }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    const result = await runBackfillChunk(initial(), db.store, "fixture-token");
    expect(result.api_calls).toBe(2);
    expect(result.status).toBe("done");
    expect(fetcher.mock.calls[1]?.[0]).toContain("start_date=31-10-2026");
  });

  it("enforces exact Bishkek date boundaries even with a broadened UTC anchor", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([message(1, 1, "2026-10-31T17:59:59 UTC")]))
      .mockResolvedValueOnce(response([message(1, 1, "2026-10-31T17:59:59 UTC"), message(2, 2, "2026-10-31T18:00:00 UTC"), message(3, 3, "2026-11-02T18:00:00 UTC")]))
      .mockResolvedValueOnce(response([], 0));
    vi.stubGlobal("fetch", fetcher);
    const db = memory();
    const result = await runBackfillChunk(initial(), db.store, "fixture-token");
    expect(result.requests_imported).toBe(1);
    expect([...db.events.keys()]).toEqual([2]);
    expect(fetcher.mock.calls[0]?.[0]).toContain("start_date=2026-10-31");
  });

  it("reports history events just like live new_request events", () => {
    const event = { client_id: 8, hook_type: "new_request", transport: "telegram", is_new_client: true, signature_valid: true, event_time: "2026-11-01T09:52:17Z", payload: { source: "backfill" } };
    expect(messengerReport([event]).total).toEqual({ requests: 1, unique: 1, fresh: 1, repeat: 0 });
  });
});