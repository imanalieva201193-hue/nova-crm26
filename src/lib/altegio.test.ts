import { describe, expect, it } from "vitest";
import { altegioFunnel, altegioTime, normalizeRecord, type FunnelRecord } from "./altegio";

const base: FunnelRecord = { record_id: 1, phone_key: "+996700000001", client_name: "А", branch_code: "moskovskaya", direction: "Общий профиль", kind: "general", staff: "Врач 1", doctor_id: null, employee: "a@x", source: "Altegio", created_at: "2026-11-02T05:00:00Z", visit_at: "2026-11-03T05:00:00Z", attendance: 0, deleted: false, amount: 0 };
const f = { from: "2026-11-01", to: "2026-11-30" };

describe("altegio", () => {
  it("parses Altegio offsets and assumes Bishkek time without offset", () => {
    expect(altegioTime("2026-01-16T20:35:11-0500")).toBe("2026-01-17T01:35:11.000Z");
    expect(altegioTime("2026-09-21 10:00:00")).toBe("2026-09-21T04:00:00.000Z");
  });
  it("normalizes attendance, confirmed, creator and amount from documented fields", () => {
    const r = normalizeRecord({ id: 5, company_id: 7, attendance: 1, confirmed: 1, created_user_id: 9, deleted: false, client: { id: 3, name: "Пациент", phone: "+996700000001" }, staff: { id: 4, name: "Доктор" }, services: [{ id: 1, cost: 1000 }, { id: 2, cost: 500 }], datetime: "2026-11-03T10:00:00+06:00" }, 1)!;
    expect([r.location_id, r.attendance, r.confirmed, r.created_user_id, r.amount, r.staff_id]).toEqual([7, 1, true, 9, 1500, 4]);
  });
  it("counts bookings, attendance, no-shows and cancellations once per patient", () => {
    const rows = [base, { ...base, record_id: 2, attendance: 1 }, { ...base, record_id: 3, phone_key: "+996700000002", attendance: -1 }, { ...base, record_id: 4, phone_key: "+996700000003", deleted: true }];
    const m = Object.fromEntries(altegioFunnel(rows, f).metrics.map((x) => [x.key, x.value]));
    expect([m["booked"], m["came"], m["no_show"], m["cancelled"]]).toEqual([2, 1, 1, 1]);
  });
  it("detects referral from general profile to surgery and the branch flow", () => {
    const later = { ...base, record_id: 9, branch_code: "abd3", direction: "Хирургия", kind: "surgeon_consult", staff: "Хирург", created_at: "2026-11-05T05:00:00Z", visit_at: "2026-11-06T05:00:00Z" };
    const r = altegioFunnel([base, later], f);
    expect(r.metrics.find((m) => m.key === "referred")!.value).toBe(1);
    expect(r.flows.find((x) => x.label === "Филиал: moskovskaya → abd3")!.value).toBe(1);
  });
  it("sums only completed operations and computes conversions", () => {
    const rows = [{ ...base, attendance: 1 }, { ...base, record_id: 7, kind: "operation", attendance: 1, amount: 200000 }, { ...base, record_id: 8, kind: "operation", attendance: 0, amount: 50000, phone_key: "+996700000004" }];
    const r = altegioFunnel(rows, f);
    const op = r.metrics.find((m) => m.key === "op_done")!;
    expect([op.value, op.money, r.metrics.find((m) => m.key === "op_booked")!.value]).toEqual([1, 200000, 2]);
    expect(r.conversions).toEqual({ bookedToCame: 100, cameToOperation: 100 });
  });
});
