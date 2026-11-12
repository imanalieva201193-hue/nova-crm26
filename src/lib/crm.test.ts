import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  leadCategory,
  missingForStage,
  estimateTotals,
  doctorWorksOn,
  shouldSuggestLost,
  FINAL,
} from "./crm";

const base = {
  phone: "+996555000000",
  lead_date: "2026-11-12",
  source: "Instagram",
  branch_code: "abd3",
  line: "Колл-центр",
  funnel: "nova_surgery",
  stage: 1,
};

describe("Nova CRM rules", () => {
  it("normalizes 0555… and 555… to +996", () => {
    expect(normalizePhone("0555 12-34-56")).toBe("+996555123456");
    expect(normalizePhone("555123456")).toBe("+996555123456");
    expect(normalizePhone("996555123456")).toBe("+996555123456");
  });
  it("foreign patient adds 10%, USD kept separate, packages ignore discount", () => {
    const t = estimateTotals(
      [
        { name: "a", qty: 1, price: 10000, currency: "KGS" },
        { name: "b", qty: 1, price: 1000, currency: "USD" },
        { name: "p", qty: 1, price: 5000, currency: "KGS", is_package: true, discount: 50 },
      ],
      true,
    );
    expect(t.kgs).toBe(16500);
    expect(t.usd).toBe(1100);
  });
  it("category order: trash → final → lost → warm → primary", () => {
    expect(leadCategory({ ...base, outcome: "Мусорный", stage: FINAL })).toBe("Мусорные");
    expect(leadCategory({ ...base, stage: FINAL })).toBe("Финал");
    expect(leadCategory({ ...base, outcome: "Не пришёл", stage: 4 })).toBe("Не пришли");
    expect(leadCategory({ ...base, stage: 3 })).toBe("Прогретые");
    expect(leadCategory({ ...base, stage: 2 })).toBe("Первичные");
  });
  it("booking stage needs doctor and visit date; sale stage needs operation fields", () => {
    expect(missingForStage(base, 3)).toEqual(["Врач", "Дата визита"]);
    expect(missingForStage({ ...base, doctor_id: "d", visit_date: "2026-11-13" }, 6)).toEqual([
      "Дата операции",
      "Стоимость",
      "Предоплата",
      "Дата предоплаты",
    ]);
  });
  it("Nova Check stage 3 requires prepayment", () => {
    expect(missingForStage({ ...base, funnel: "nova_check" }, 3)).toEqual(["Предоплата"]);
  });
  it("checks doctor working days incl. ranges", () => {
    expect(doctorWorksOn("Пн–Пт 9:00–18:00", "2026-11-14")).toBe(false); // Saturday
    expect(doctorWorksOn("Пн–Пт 9:00–18:00", "2026-11-12")).toBe(true); // Thursday
    expect(doctorWorksOn("Вт, Чт 13:00–16:00", "2026-11-11")).toBe(false); // Wednesday
  });
  it("3 no-answer attempts in 3 days suggests lost", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const t = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) => ({
      touched_at: d + "T08:00:00Z",
      no_answer: true,
    }));
    expect(shouldSuggestLost(t, now)).toBe(true);
    expect(shouldSuggestLost(t.slice(0, 2), now)).toBe(false);
  });
});

import { periodRange, reportStats, reanimationCandidates, leadRevenue } from "./crm";
describe("reports", () => {
  it("period ranges", () => {
    expect(periodRange("day", "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-12" });
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("year", "2026-11-12")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("conversion excludes trash; avg check over won", () => {
    const L = (id: string, o: Partial<typeof base & { outcome: string }>) => ({
      ...base,
      id,
      ...o,
    });
    const leads = [L("a", { stage: FINAL }), L("b", {}), L("c", { outcome: "Мусорный" })];
    const s = reportStats(leads, { a: 100000 });
    expect(s.conv).toBe(50);
    expect(s.avgCheck).toBe(100000);
    expect(s.trash).toBe(1);
  });
  it("revenue uses operation cost, else estimate", () => {
    expect(leadRevenue({ ...base, id: "x", stage: FINAL, operation_cost: 200000 })).toBe(200000);
    expect(
      leadRevenue({ ...base, id: "x", stage: FINAL }, [
        { name: "a", qty: 2, price: 1000, currency: "KGS" },
      ]),
    ).toBe(2000);
    expect(leadRevenue({ ...base, id: "x", stage: 3, operation_cost: 5 })).toBe(0);
  });
  it("reanimation: lost/no-show older than 14 days", () => {
    const r = reanimationCandidates(
      [
        { ...base, id: "1", outcome: "Потерянный", lead_date: "2026-10-01" },
        { ...base, id: "2", outcome: "Потерянный", lead_date: "2026-11-05" },
        { ...base, id: "3", outcome: "Мусорный", lead_date: "2026-10-01" },
        { ...base, id: "4", outcome: "Не пришёл", lead_date: "2026-10-29" },
      ],
      "2026-11-12",
    );
    expect(r.map((x) => x.id)).toEqual(["1", "4"]);
  });
});

import { surgeryDaily, surgeryTotal, surgeonReport } from "./crm";
describe("surgery report", () => {
  const S = (id: string, o: Record<string, unknown>) => ({
    id,
    lead_date: "2026-11-02",
    stage: 2,
    ...o,
  });
  const leads = [
    S("a", {}),
    S("b", { stage: 5, came: true, doctor_id: "d1", visit_date: "2026-11-03T10:00:00+06:00" }),
    S("c", {
      stage: 6,
      came: true,
      doctor_id: "d1",
      visit_date: "2026-11-03T10:00:00+06:00",
      operation_date: "2026-11-10",
    }),
    S("d", {
      stage: 10,
      came: true,
      doctor_id: "d1",
      visit_date: "2026-11-02T10:00:00+06:00",
      operation_date: "2026-11-10",
      operation_cost: 100000,
      prepayment: 20000,
    }),
    S("e", { outcome: "Потерянный" }),
  ];
  it("daily: requests by request date, consults by visit day, conversion = booked op / held consults", () => {
    const days = surgeryDaily(leads, "2026-11-02", "2026-11-10");
    expect(days[0]).toMatchObject({ requests: 5, refusals: 1, heldConsult: 1 });
    expect(days[1]).toMatchObject({ bookedConsult: 2, heldConsult: 2 });
    const t = surgeryTotal(days);
    expect(t).toMatchObject({ heldConsult: 3, bookedOp: 2, doneOp: 1, conv: 66.7 });
  });
  it("per surgeon: conversion and reach to operation", () => {
    const [r] = surgeonReport(leads);
    expect(r).toMatchObject({
      heldConsult: 3,
      bookedOp: 2,
      doneOp: 1,
      conv: 66.7,
      reach: 50,
      sum: 100000,
      prepay: 20000,
    });
  });
});
