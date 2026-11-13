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

import { prevRange, dashStats, funnelSteps, checkupFunnelSteps, checkupStats } from "./crm";
describe("dashboard", () => {
  it("week range is Monday–Sunday; prevRange shifts one period back", () => {
    expect(periodRange("week", "2026-11-12")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(prevRange("week", "2026-11-12")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(prevRange("day", "2026-11-01")).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(prevRange("month", "2026-11-12")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  const D = (id: string, o: Record<string, unknown>) => ({
    ...base,
    id,
    ...o,
  });
  const leads = [
    D("a", { stage: 3, visit_date: "2026-11-13", came: true }), // booked + came
    D("b", { stage: 6, came: true, visit_date: "2026-11-10" }), // booked op
    D("c", { stage: FINAL, came: true, operation_cost: 50000 }), // done op
    D("d", { outcome: "Не пришёл", stage: 3 }),
    D("e", { outcome: "Потерянный" }),
    D("f", { outcome: "Мусорный" }),
    D("g", {}), // just a lead
  ];
  it("dashStats: bookings, visits, operations, conversions", () => {
    const s = dashStats(leads);
    expect(s).toMatchObject({
      leads: 7,
      trash: 1,
      bookedConsult: 4,
      cameConsult: 3,
      noShow: 1,
      bookedOp: 2,
      doneOp: 1,
      refusals: 1,
      convLeadConsult: 50, // 3 / 6 non-trash
      convConsultOp: 66.7, // 2 / 3 came
    });
  });
  it("funnel steps with conversion to previous step", () => {
    const steps = funnelSteps(leads);
    expect(steps.map((s) => s.count)).toEqual([6, 4, 3, 2, 1]);
    expect(steps.map((s) => s.conv)).toEqual([100, 66.7, 75, 66.7, 50]);
  });
});

describe("checkup", () => {
  const C = (id: string, o: Record<string, unknown>) => ({
    ...base,
    id,
    funnel: "nova_check",
    branch_code: "abd2",
    ...o,
  });
  const leads = [
    C("a", { stage: 3, prepayment: 5000, confirmed: true, visit_date: "2026-11-13" }),
    C("b", { stage: FINAL, came: true, confirmed: true }),
    C("c", { outcome: "Не пришёл", stage: 3, prepayment: 5000 }),
    C("d", { outcome: "Потерянный" }),
    C("e", { stage: 2 }),
    C("f", { stage: 7, parent_lead_id: "b", came: true }),
  ];
  it("checkupStats: all KPIs from the spec", () => {
    const s = checkupStats(leads, { b: 20000 });
    expect(s).toMatchObject({
      leads: 6,
      booked: 4,
      confirmed: 2,
      came: 2,
      done: 1,
      cancelled: 1,
      noShow: 1,
      inWork: 3, // a (записан, ещё не пришёл), e (этап 2), f (повторные визиты)
      repeat: 1,
      revenue: 20000,
    });
  });
  it("checkup funnel: Лиды → Записались → Пришли → Завершили", () => {
    const steps = checkupFunnelSteps(leads);
    expect(steps.map((s) => s.count)).toEqual([6, 4, 2, 1]);
    expect(steps.map((s) => s.conv)).toEqual([100, 66.7, 50, 50]);
  });
});

import { attributionStamp, contributionReport } from "./crm";
describe("single card attribution", () => {
  it("stamps each step once and never overwrites", () => {
    expect(attributionStamp({ stage: 1 }, "a@x")).toEqual({ brought_by_email: "a@x" });
    expect(
      attributionStamp(
        { stage: 10, confirmed: true, brought_by_email: "a@x", booked_by_email: "b@x" },
        "c@x",
      ),
    ).toEqual({ confirmed_by_email: "c@x", operation_by_email: "c@x" });
  });
  it("counts one patient once per step across employees", () => {
    const r = contributionReport([
      {
        stage: 10,
        brought_by_email: "cc@x",
        booked_by_email: "cc@x",
        confirmed_by_email: "adm@x",
        operation_by_email: "mgr@x",
      },
    ]);
    const by = Object.fromEntries(r.map((x) => [x.email, x]));
    expect(by["cc@x"]).toMatchObject({ brought: 1, booked: 1, operations: 0 });
    expect(by["adm@x"]!.confirmed).toBe(1);
    expect(by["mgr@x"]!.operations).toBe(1);
  });
});

import { openTasks } from "./crm";
import { inWorkspace, workspaceMetrics } from "./crm";
describe("workspace source records", () => {
  it("calculates agent bonus only for completed operations from source rows", () => {
    const leads = [
      { ...base, id: "a", stage: 10, partner_id: "agent", operation_date: "2026-11-13" },
      { ...base, id: "b", stage: 3, partner_id: "agent" },
    ];
    const bonus = workspaceMetrics(leads, {}, "2026-11-13", [
      { id: "agent", bonus_per_operation: 500 },
    ]).find((m) => m.key === "bonus");
    expect(bonus?.value).toBe(500);
    expect(bonus?.ids).toEqual(["a"]);
  });
  it("keeps the second floor checkup and general profile separate", () => {
    const l = { ...base, id: "a", branch_code: "abd2", funnel: "nova_check" };
    expect(inWorkspace(l, "abd2", "checkup")).toBe(true);
    expect(inWorkspace(l, "abd2", "general")).toBe(false);
    expect(inWorkspace({ ...l, funnel: "nova_general" }, "abd2", "general")).toBe(true);
  });
  it("shows a shared patient in relevant sources without creating patients", () => {
    const l = { ...base, id: "a", source: "Таргет", partner_id: "p" };
    expect(inWorkspace(l, "target")).toBe(true);
    expect(inWorkspace(l, "agents")).toBe(true);
    expect(inWorkspace(l, "business", "B2B")).toBe(false);
  });
  it("every metric carries the exact contributing records and conversion denominator", () => {
    const rows = [
      { ...base, id: "a", patient_id: "p", stage: 1 },
      { ...base, id: "b", patient_id: "p", stage: 10, came: true },
    ];
    const m = Object.fromEntries(
      workspaceMetrics(rows, { b: 12000 }, "2026-11-13").map((x) => [x.key, x]),
    );
    expect(m["all"]?.value).toBe(2);
    expect(m["patients"]?.value).toBe(1);
    expect(m["booked"]?.ids).toEqual(["b"]);
    expect(m["revenue"]?.value).toBe(12000);
    expect(m["revenue"]?.ids).toEqual(["b"]);
    expect(m["conversion"]?.value).toBe(50);
    expect(m["conversion"]?.denominatorIds).toEqual(["a", "b"]);
  });
});
describe("open tasks", () => {
  const today = "2026-11-12";
  it("past visit without came, overdue touch are open; closed lead has none", () => {
    const l = {
      ...base,
      stage: 3,
      doctor_id: "d",
      visit_date: "2026-11-10T10:00:00+06:00",
      came: false,
      next_touch: "2026-11-11",
    };
    expect(openTasks(l, today)).toEqual(["Визит прошёл — отметьте явку", "Просрочено касание"]);
    expect(openTasks({ ...l, outcome: "Потерянный" }, today)).toEqual([]);
  });
  it("missing next touch and missing fields are open", () => {
    expect(openTasks({ ...base, stage: 3 }, today)).toEqual([
      "Не заполнено: Врач, Дата визита",
      "Не назначено следующее касание",
    ]);
  });
});
