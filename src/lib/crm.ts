// Business rules of Nova CRM (sales department). Pure functions — covered by tests.

export const BRANCHES = [
  { code: "asanbay", name: "Асанбай (Rinos)", short: "Асанбай" },
  { code: "moskovskaya", name: "Московская", short: "Московская" },
  { code: "abd2", name: "Абдумомунова, 2 этаж", short: "Абд. 2 эт." },
  { code: "abd3", name: "Абдумомунова, 3 этаж", short: "Абд. 3 эт." },
] as const;
export type BranchCode = (typeof BRANCHES)[number]["code"];
export const branchName = (c?: string | null) => BRANCHES.find((b) => b.code === c)?.name ?? "—";

export type FunnelCode = "rinos" | "nova_general" | "nova_check" | "nova_surgery";
export const REANIMATION = 9;
export const FINAL = 10;

export const FUNNELS: Record<
  FunnelCode,
  { name: string; stages: Record<number, string>; final: string; surgery: boolean }
> = {
  rinos: {
    name: "Rinos — хирургия",
    surgery: true,
    final: "Операция состоялась",
    stages: {
      1: "Привлечение лида",
      2: "Обработка обращения",
      3: "Запись на консультацию",
      4: "Подтверждение и явка",
      5: "Консультация хирурга",
      6: "Продажа операции, предоплата",
      7: "Подготовка к операции",
      8: "Операция",
    },
  },
  nova_general: {
    name: "Nova — общий профиль",
    surgery: false,
    final: "Пришёл к врачу",
    stages: {
      1: "Привлечение лида",
      2: "Обработка обращения",
      3: "Запись к профильному врачу",
      4: "Подтверждение и явка",
      5: "Консультация врача",
      6: "Направление к хирургу",
    },
  },
  nova_check: {
    name: "Nova Check",
    surgery: false,
    final: "Чекап пройден",
    stages: {
      1: "Привлечение лида",
      2: "Обработка обращения",
      3: "Заявка и предоплата",
      4: "Подготовка и встреча",
      5: "Обследование (3 дня)",
      6: "Контроль и паспорт здоровья",
      7: "Повторные визиты",
    },
  },
  nova_surgery: {
    name: "Nova — хирургия",
    surgery: true,
    final: "Операция состоялась",
    stages: {
      1: "Привлечение лида",
      2: "Обработка обращения",
      3: "Запись на консультацию",
      4: "Подтверждение и явка",
      5: "Консультация хирурга",
      6: "Продажа операции, предоплата",
      7: "Подготовка к операции",
      8: "Операция",
    },
  },
};

export const BRANCH_FUNNELS: Record<string, FunnelCode[]> = {
  asanbay: ["rinos"],
  moskovskaya: ["nova_general"],
  abd2: ["nova_general", "nova_check"],
  abd3: ["nova_surgery"],
};

export function stageList(f: FunnelCode): { n: number; label: string }[] {
  const fn = FUNNELS[f];
  return [
    ...Object.entries(fn.stages).map(([n, label]) => ({ n: Number(n), label })),
    { n: REANIMATION, label: "Реанимация базы" },
    { n: FINAL, label: fn.final },
  ];
}
export const stageLabel = (f: string, n: number) =>
  stageList((f as FunnelCode) in FUNNELS ? (f as FunnelCode) : "nova_general").find(
    (s) => s.n === n,
  )?.label ?? `Этап ${n}`;

export const LINES = ["Колл-центр", "Direct", "Филиал", "Агентская программа"];
export const CHANNELS = ["Звонок", "WhatsApp", "Instagram", "Telegram", "Визит"];
export const OUTCOMES = ["Мусорный", "Потерянный", "Не пришёл"] as const;

export const ROLES: Record<string, string> = {
  commercial_director: "Коммерческий директор",
  rop: "РОП",
  senior_cc: "Старший менеджер колл-центра",
  operator: "Оператор КЦ / Direct",
  sales_manager: "Менеджер по продажам (Хантер / Фермер)",
  agent_manager: "Менеджер агентской программы",
  checkup_manager: "Менеджер по чекапу",
  branch_admin: "Администратор филиала / кассир",
  reanimator: "Реаниматор базы",
};
export const ALL_BRANCH_ROLES = [
  "commercial_director",
  "rop",
  "senior_cc",
  "operator",
  "agent_manager",
  "reanimator",
];

/** +996XXXXXXXXX from 0555…, 555…, 996555…, with spaces/dashes. Returns null if impossible. */
export function normalizePhone(input: string): string | null {
  const d = (input || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("996")) return "+" + d;
  if (d.length === 10 && d.startsWith("0")) return "+996" + d.slice(1);
  if (d.length === 9) return "+996" + d;
  if (d.length >= 10 && (input || "").trim().startsWith("+")) return "+" + d; // foreign numbers
  return null;
}

export type LeadLike = {
  stage: number;
  outcome?: string | null;
  interest?: boolean | null;
  funnel: string;
  phone?: string | null;
  lead_date?: string | null;
  source?: string | null;
  branch_code?: string | null;
  line?: string | null;
  doctor_id?: string | null;
  visit_date?: string | null;
  operation_date?: string | null;
  operation_cost?: number | null;
  prepayment?: number | null;
  prepayment_date?: string | null;
};

export function leadCategory(l: LeadLike): string {
  if (l.outcome === "Мусорный") return "Мусорные";
  if (l.stage === FINAL) return "Финал";
  if (l.outcome === "Потерянный") return "Потерянные";
  if (l.outcome === "Не пришёл") return "Не пришли";
  if (l.interest || (l.stage >= 3 && l.stage !== REANIMATION)) return "Прогретые";
  return "Первичные";
}

/** Missing required fields to be at `stage`. Empty array = OK. */
export function missingForStage(l: LeadLike, stage: number): string[] {
  const miss: string[] = [];
  if (!l.phone) miss.push("Телефон");
  if (!l.lead_date) miss.push("Дата заявки");
  if (!l.source) miss.push("Источник");
  if (!l.branch_code) miss.push("Филиал");
  if (!l.funnel) miss.push("Воронка");
  if (!l.line) miss.push("Линия");
  if (stage === REANIMATION) return miss;
  const surgery = FUNNELS[l.funnel as FunnelCode]?.surgery;
  if (l.funnel === "nova_check") {
    if (stage >= 3 && !l.prepayment) miss.push("Предоплата");
    if (stage >= 4 && !l.visit_date) miss.push("Дата визита");
  } else if (stage >= 3) {
    if (!l.doctor_id) miss.push("Врач");
    if (!l.visit_date) miss.push("Дата визита");
  }
  if (surgery && stage >= 6) {
    if (!l.operation_date) miss.push("Дата операции");
    if (!l.operation_cost) miss.push("Стоимость");
    if (!l.prepayment) miss.push("Предоплата");
    if (!l.prepayment_date) miss.push("Дата предоплаты");
  }
  return miss;
}

export const NOVA_CHECK_PREPAYMENT = 5000;
export const NOVA_CHECK_DAILY_LIMIT = 3;
export const FOREIGNER_MARKUP = 0.1;
export const INSTALLMENT_MAX = 250000;
export const INSTALLMENT_GUARANTOR_FROM = 300000;

export type EstimateItem = {
  name: string;
  qty: number;
  price: number;
  currency: string;
  price_from?: boolean;
  discount?: number;
  is_package?: boolean;
};

export function estimateTotals(items: EstimateItem[], foreigner: boolean) {
  const tot = { KGS: 0, USD: 0 };
  let from = false;
  for (const i of items) {
    const disc = i.is_package ? 0 : Math.min(Math.max(i.discount ?? 0, 0), 100);
    let v = i.price * i.qty * (1 - disc / 100);
    if (foreigner) v *= 1 + FOREIGNER_MARKUP;
    tot[i.currency === "USD" ? "USD" : "KGS"] += v;
    if (i.price_from) from = true;
  }
  return { kgs: Math.round(tot.KGS), usd: Math.round(tot.USD * 100) / 100, from };
}

export const fmtMoney = (v: number, cur = "KGS") =>
  cur === "USD" ? `$${v.toLocaleString("ru-RU")}` : `${Math.round(v).toLocaleString("ru-RU")} сом`;

export function totalsText(t: { kgs: number; usd: number; from: boolean }) {
  const parts = [];
  if (t.kgs) parts.push(fmtMoney(t.kgs));
  if (t.usd) parts.push(fmtMoney(t.usd, "USD"));
  if (!parts.length) parts.push("0 сом");
  return (t.from ? "от " : "") + parts.join(" + ");
}

export function patientText(items: EstimateItem[], foreigner: boolean, branch?: string) {
  const lines = items.map(
    (i) =>
      `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ""} — ${i.price_from ? "от " : ""}${fmtMoney(i.price * i.qty, i.currency)}`,
  );
  const t = estimateTotals(items, foreigner);
  return [
    "Здравствуйте! Расчёт стоимости в Nova Clinic" +
      (branch ? ` (${branchName(branch)})` : "") +
      ":",
    ...lines,
    foreigner ? "Для иностранных пациентов +10%." : "",
    `Итого: ${totalsText(t)}`,
    t.from ? "Точную стоимость врач подтвердит на консультации." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Bishkek-local date as YYYY-MM-DD */
export function bishkekDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
}
export const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
/** Does a doctor's schedule text mention the weekday of `dateISO`? Unknown schedule → true. */
export function doctorWorksOn(schedule: string | null | undefined, dateISO: string): boolean {
  if (!schedule) return true;
  const s = schedule.replace(/\(.*?\)/g, "");
  if (!DAYS.some((d) => s.includes(d))) return true;
  const day = new Date(dateISO.slice(0, 10) + "T12:00:00Z").getUTCDay();
  const order = [1, 2, 3, 4, 5, 6, 0];
  for (const m of s.matchAll(/(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\s*[–-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс)/g)) {
    const a = order.indexOf(DAYS.indexOf(m[1] ?? "")),
      b = order.indexOf(DAYS.indexOf(m[2] ?? ""));
    const i = order.indexOf(day);
    if (i >= a && i <= b) return true;
  }
  return new RegExp(DAYS[day] ?? "").test(
    s.replace(/(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\s*[–-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс)/g, ""),
  );
}

/** 3 no-answer touches within the last 3 days → suggest closing as lost */
export function shouldSuggestLost(
  touches: { touched_at: string; no_answer: boolean }[],
  now = new Date(),
): boolean {
  const since = now.getTime() - 3 * 86400_000;
  return (
    touches.filter((t) => t.no_answer && new Date(t.touched_at).getTime() >= since).length >= 3
  );
}

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cur = "",
    q = false;
  const t = text.replace(/^\uFEFF/, "");
  const first = t.split("\n")[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const h = head.map((x) => x.trim());
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "\uFEFF" + [keys.join(";"), ...rows.map((r) => keys.map((k) => esc(r[k])).join(";"))].join("\n")
  );
}

// ---------- Reports ----------
export type PeriodKind = "day" | "month" | "year";
export const PERIOD_LABEL: Record<PeriodKind, string> = {
  day: "День",
  month: "Месяц",
  year: "Год",
};

/** Inclusive YYYY-MM-DD range of the day/month/year containing `date`. */
export function periodRange(kind: PeriodKind, date: string): { from: string; to: string } {
  const [y = 1970, m = 1] = date.split("-").map(Number);
  if (kind === "day") return { from: date, to: date };
  if (kind === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export type ReportLead = LeadLike & {
  id: string;
  responsible_email?: string | null;
  came?: boolean | null;
};
export type Group = { key: string; leads: number; won: number; revenue: number; conv: number };
export type ReportStats = {
  leads: number;
  trash: number;
  lost: number;
  noShow: number;
  came: number;
  won: number;
  conv: number; // % of non-trash leads that reached the final stage
  revenue: number;
  avgCheck: number;
  byManager: Group[];
  byChannel: Group[];
  byBranch: Group[];
};

/** Revenue of a won lead: operation cost if set, otherwise its estimate (KGS). */
export function leadRevenue(l: ReportLead, items: EstimateItem[] = [], foreigner = false): number {
  if (l.stage !== FINAL) return 0;
  if (l.operation_cost) return Number(l.operation_cost);
  return estimateTotals(items, foreigner).kgs;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function reportStats(leads: ReportLead[], revenue: Record<string, number>): ReportStats {
  const group = (key: (l: ReportLead) => string): Group[] => {
    const m = new Map<string, ReportLead[]>();
    for (const l of leads) m.set(key(l), [...(m.get(key(l)) ?? []), l]);
    return [...m.entries()]
      .map(([k, ls]) => {
        const base = ls.filter((l) => l.outcome !== "Мусорный").length;
        const won = ls.filter((l) => l.stage === FINAL).length;
        return {
          key: k,
          leads: ls.length,
          won,
          revenue: ls.reduce((s, l) => s + (revenue[l.id] ?? 0), 0),
          conv: pct(won, base),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  };
  const trash = leads.filter((l) => l.outcome === "Мусорный").length;
  const won = leads.filter((l) => l.stage === FINAL).length;
  const rev = leads.reduce((s, l) => s + (revenue[l.id] ?? 0), 0);
  return {
    leads: leads.length,
    trash,
    lost: leads.filter((l) => l.outcome === "Потерянный").length,
    noShow: leads.filter((l) => l.outcome === "Не пришёл").length,
    came: leads.filter((l) => l.came).length,
    won,
    conv: pct(won, leads.length - trash),
    revenue: rev,
    avgCheck: won ? Math.round(rev / won) : 0,
    byManager: group((l) => l.responsible_email || "Без ответственного"),
    byChannel: group((l) => l.source || "—"),
    byBranch: group((l) => branchName(l.branch_code)),
  };
}

export function reportText(s: ReportStats, title: string): string {
  const g = (name: string, list: Group[]) =>
    `${name}:\n` +
    (list
      .map(
        (x) =>
          `• ${x.key}: ${x.leads} заявок, ${x.won} продаж (${x.conv}%), ${fmtMoney(x.revenue)}`,
      )
      .join("\n") || "• нет данных");
  return [
    `Отчёт Nova CRM — ${title}`,
    `Заявок: ${s.leads} (мусорных ${s.trash}, потерянных ${s.lost}, не пришли ${s.noShow})`,
    `Пришли: ${s.came}; продаж (финал): ${s.won}; конверсия: ${s.conv}%`,
    `Выручка: ${fmtMoney(s.revenue)}; средний чек: ${fmtMoney(s.avgCheck)}`,
    g("По менеджерам", s.byManager),
    g("По каналам", s.byChannel),
    g("По филиалам", s.byBranch),
  ].join("\n\n");
}

export const REANIMATION_AFTER_DAYS = 14;
/** Lost / no-show leads older than 14 days that are not yet in reanimation. */
export function reanimationCandidates<T extends ReportLead>(leads: T[], today: string): T[] {
  const edge = new Date(Date.parse(today) - REANIMATION_AFTER_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  return leads.filter(
    (l) =>
      (l.outcome === "Потерянный" || l.outcome === "Не пришёл") &&
      l.stage !== REANIMATION &&
      !!l.lead_date &&
      l.lead_date <= edge,
  );
}
