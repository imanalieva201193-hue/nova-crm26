import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { messengerBounds, messengerMonth, messengerReport, type MessengerEvent } from "./chat2desk";
import { prepareChat2deskEvent, verifyChat2desk } from "./chat2desk.server";

// Synthetic fixtures, not real credentials or customer data.
const token = "synthetic-test-fixture";
const raw = JSON.stringify({ hook_type: "new_request", request_id: 71, client_id: 8, transport: "telegram", is_new_client: true, created: 1794600000, client: { client_phone: "+996 555 000 001" } });
const timestamp = "1794600000";
const sign = (body: string) => createHmac("sha256", createHash("md5").update(token).digest("hex")).update(body + timestamp).digest("hex");

describe("Chat2Desk signatures and ingestion", () => {
  it("verifies raw body + timestamp using the MD5 hex key", () => {
    expect(verifyChat2desk(raw, sign(raw), timestamp, token)).toBe(true);
    expect(verifyChat2desk(raw + " ", sign(raw), timestamp, token)).toBe(false);
    expect(verifyChat2desk(raw, null, timestamp, token)).toBe(false);
    expect(verifyChat2desk(raw, sign(raw), timestamp, undefined)).toBe(false);
  });
  it("keeps a stable request key across retries", () => {
    const a = prepareChat2deskEvent(raw, true);
    expect(a.event_key).toBe("new_request:71");
    expect(prepareChat2deskEvent(raw, true).event_key).toBe(a.event_key);
  });
  it("does not store personal data or poison a request key from invalid input", () => {
    const event = prepareChat2deskEvent(raw, false);
    expect(event.client_id).toBeNull();
    expect(event.payload).toEqual({ reason: "Подпись отсутствует или неверна" });
    expect(event.event_key).not.toBe("new_request:71");
    expect(event.signature_valid).toBe(false);
  });
  it("keeps separate client updates and requests without request IDs", () => {
    const a = prepareChat2deskEvent(JSON.stringify({ hook_type: "client_updated", client_id: 8, client: { name: "A" } }), true);
    const b = prepareChat2deskEvent(JSON.stringify({ hook_type: "client_updated", client_id: 8, client: { name: "B" } }), true);
    expect(a.event_key).not.toBe(b.event_key);
  });
  it("accepts supported hooks and rejects malformed data", () => {
    expect(prepareChat2deskEvent(JSON.stringify({ hook_type: "new_client", client: { id: 8 } }), true).event_key).toBe("new_client:8");
    expect(prepareChat2deskEvent('{', true).signature_valid).toBe(false);
    expect(prepareChat2deskEvent(JSON.stringify({ hook_type: "new_request", client_id: -1 }), true).signature_valid).toBe(false);
  });
});

describe("Chat2Desk reporting", () => {
  const e = (client_id: number, is_new_client: boolean, transport = "telegram"): MessengerEvent => ({ client_id, is_new_client, transport, hook_type: "new_request", signature_valid: true, event_time: "2026-11-13T18:30:00Z" });
  it("counts requests but partitions unique clients into new and repeat", () => {
    const report = messengerReport([e(1, true), e(1, false), e(2, false, "whatsapp"), { ...e(3, true), signature_valid: false }, { ...e(4, true), hook_type: "new_client" }]);
    expect(report.total).toEqual({ requests: 3, unique: 2, fresh: 1, repeat: 1 });
    expect(report.channels.find(r => r.label === "telegram")).toEqual({ label: "telegram", requests: 2, unique: 1, fresh: 1, repeat: 0 });
    expect(report.days[0]?.label).toBe("2026-11-14");
  });
  it("uses inclusive Bishkek dates with exclusive upper UTC bound", () => {
    expect(messengerBounds("2026-11-01", "2026-11-30")).toEqual({ start: "2026-10-31T18:00:00.000Z", end: "2026-11-30T18:00:00.000Z" });
    expect(messengerMonth(new Date("2026-10-31T19:00:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});