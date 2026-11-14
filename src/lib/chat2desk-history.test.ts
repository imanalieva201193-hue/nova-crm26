import { describe, expect, it } from "vitest";
import { clientHistory, type HistoryEvent } from "./chat2desk-history";
const event = (id: string, changes: Partial<HistoryEvent> = {}): HistoryEvent => ({ id, client_id: 8, request_id: 71, channel_id: 2, transport: "telegram", is_new_client: false, event_time: "2026-11-13T09:00:00.000Z", hook_type: "new_request", signature_valid: true, ...changes });
const filters = { from: "2026-11-13", to: "2026-11-13", search: "", transport: "" };
describe("Chat2Desk client history", () => {
  it("groups multiple requests into one client and ignores invalid/non-request events", () => {
    const rows = clientHistory([event("a", { is_new_client: true }), event("b", { request_id: 72 }), event("c", { signature_valid: false }), event("d", { hook_type: "new_client" })], [], filters);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.history).toHaveLength(2);
    expect(rows[0]?.fresh).toBe(true);
  });
  it("filters exact Bishkek days and selected channels", () => {
    const rows = clientHistory([event("a", { event_time: "2026-11-12T18:00:00.000Z" }), event("b", { event_time: "2026-11-13T18:00:00.000Z" }), event("c", { transport: "whatsapp" })], [], { ...filters, transport: "telegram" });
    expect(rows[0]?.history.map(e => e.id)).toEqual(["a"]);
  });
  it("searches by client ID without requiring a linked CRM patient", () => {
    expect(clientHistory([event("a")], [], { ...filters, search: "8" })).toHaveLength(1);
    expect(clientHistory([event("a")], [], { ...filters, search: "missing" })).toHaveLength(0);
  });
});