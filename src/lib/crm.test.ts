import { describe, expect, it } from "vitest";
import { normalizePhone, leadCategory, missingForStage, estimateTotals, doctorWorksOn, shouldSuggestLost, FINAL } from "./crm";

const base = { phone: "+996555000000", lead_date: "2026-11-12", source: "Instagram", branch_code: "abd3", line: "Колл-центр", funnel: "nova_surgery", stage: 1 };

describe("Nova CRM rules", () => {
  it("normalizes 0555… and 555… to +996", () => {
    expect(normalizePhone("0555 12-34-56")).toBe("+996555123456");
    expect(normalizePhone("555123456")).toBe("+996555123456");
    expect(normalizePhone("996555123456")).toBe("+996555123456");
  });
  it("foreign patient adds 10%, USD kept separate, packages ignore discount", () => {
    const t = estimateTotals([
      { name: "a", qty: 1, price: 10000, currency: "KGS" },
      { name: "b", qty: 1, price: 1000, currency: "USD" },
      { name: "p", qty: 1, price: 5000, currency: "KGS", is_package: true, discount: 50 },
    ], true);
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
    expect(missingForStage({ ...base, doctor_id: "d", visit_date: "2026-11-13" }, 6)).toEqual(["Дата операции", "Стоимость", "Предоплата", "Дата предоплаты"]);
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
    const t = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) => ({ touched_at: d + "T08:00:00Z", no_answer: true }));
    expect(shouldSuggestLost(t, now)).toBe(true);
    expect(shouldSuggestLost(t.slice(0, 2), now)).toBe(false);
  });
});
