// Pure Altegio rules: record normalization and the «Воронка по Altegio» report.
export const ALTEGIO_WEBHOOK_URL = "https://nova-crm26.lovable.app/api/public/altegio-webhook";
export const ALTEGIO_HISTORY_FROM = "2026-09-01";
export const ALTEGIO_KINDS = { surgeon_consult: "Консультация хирурга", operation: "Операция", general: "Приём врача общего профиля" } as const;
export const GENERAL_BRANCHES = ["moskovskaya", "abd2"];
export const SURGERY_BRANCHES = ["abd3", "asanbay"];

type Raw = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== "" ? n : null; };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});

/** Altegio dates look like 2026-01-16T20:35:11-0500 or 2026-09-21 10:00:00 (location time = Bishkek). */
export function altegioTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let t = s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(t)) t += "+06:00";
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export type AltegioRow = {
  record_id: number; location_id: number; client_id: number | null; client_name: string | null; phone: string | null;
  staff_id: number | null; staff_name: string | null; services: { id: number | null; title: string | null; cost: number }[];
  amount: number; visit_at: string | null; attendance: number; confirmed: boolean; created_user_id: number | null;
  created_at: string | null; changed_at: string | null; deleted: boolean; payload: Raw;
};

export function normalizeRecord(raw: Raw, locationId: number): AltegioRow | null {
  const id = num(raw["id"]);
  if (id == null) return null;
  const client = obj(raw["client"]);
  const staff = obj(raw["staff"]);
  const services = (Array.isArray(raw["services"]) ? raw["services"] : []).map((s) => {
    const o = obj(s);
    return { id: num(o["id"]), title: str(o["title"]), cost: num(o["cost"]) ?? 0 };
  });
  return {
    record_id: id, location_id: num(raw["company_id"]) ?? locationId,
    client_id: num(client["id"]), client_name: str(client["name"]), phone: str(client["phone"]),
    staff_id: num(raw["staff_id"]) ?? num(staff["id"]), staff_name: str(staff["name"]),
    services, amount: services.reduce((a, s) => a + s.cost, 0),
    visit_at: altegioTime(raw["datetime"] ?? raw["date"]),
    attendance: num(raw["attendance"]) ?? num(raw["visit_attendance"]) ?? 0,
    confirmed: num(raw["confirmed"]) === 1 || raw["confirmed"] === true,
    created_user_id: num(raw["created_user_id"]),
    created_at: altegioTime(raw["create_date"]), changed_at: altegioTime(raw["last_change_date"]),
    deleted: raw["deleted"] === true || num(raw["deleted"]) === 1, payload: raw,
  };
}

export type FunnelRecord = {
  record_id: number; phone_key: string | null; client_name: string | null; branch_code: string | null; direction: string | null;
  kind: string | null; staff: string; doctor_id: string | null; employee: string; source: string;
  created_at: string | null; visit_at: string | null; attendance: number; deleted: boolean; amount: number;
};
export type FunnelFilter = { from: string; to: string; branch?: string; direction?: string; doctor?: string; employee?: string; source?: string };
export type Metric = { key: string; label: string; value: number; patients: string[]; money?: number };

const bishkekDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 10) : "");
const inPeriod = (iso: string | null, f: FunnelFilter) => { const d = bishkekDay(iso); return !!d && d >= f.from && d <= f.to; };
const uniq = (rows: FunnelRecord[]) => [...new Set(rows.map((r) => r.phone_key).filter((p): p is string => !!p))];
const metric = (key: string, label: string, rows: FunnelRecord[], money?: number): Metric => ({ key, label, value: uniq(rows).length, patients: uniq(rows), ...(money === undefined ? {} : { money }) });

export function altegioFunnel(all: FunnelRecord[], f: FunnelFilter) {
  const match = (r: FunnelRecord) => (!f.branch || r.branch_code === f.branch) && (!f.direction || r.direction === f.direction) &&
    (!f.doctor || r.staff === f.doctor) && (!f.employee || r.employee === f.employee) && (!f.source || r.source === f.source);
  const rows = all.filter(match);
  const created = rows.filter((r) => inPeriod(r.created_at, f));
  const visits = rows.filter((r) => inPeriod(r.visit_at, f));
  const isOp = (r: FunnelRecord) => r.kind === "operation";
  const booked = created.filter((r) => !isOp(r) && !r.deleted);
  const came = visits.filter((r) => !isOp(r) && !r.deleted && r.attendance === 1);
  const noShow = visits.filter((r) => !isOp(r) && !r.deleted && r.attendance === -1);
  const cancelled = visits.filter((r) => r.deleted);
  const opBooked = created.filter((r) => isOp(r) && !r.deleted);
  const opDone = visits.filter((r) => isOp(r) && !r.deleted && r.attendance === 1);
  // Referral = the same patient had an earlier general-profile record before a surgery-branch record created in the period.
  const byPatient = new Map<string, FunnelRecord[]>();
  for (const r of all) if (r.phone_key && !r.deleted) byPatient.set(r.phone_key, [...(byPatient.get(r.phone_key) ?? []), r]);
  const referred = created.filter((r) => !r.deleted && r.branch_code && SURGERY_BRANCHES.includes(r.branch_code) &&
    (byPatient.get(r.phone_key ?? "") ?? []).some((p) => p.branch_code && GENERAL_BRANCHES.includes(p.branch_code) && (p.created_at ?? "") < (r.created_at ?? "")));
  const patientsInBase = rows.filter((r) => inPeriod(r.created_at, f) || inPeriod(r.visit_at, f));
  const metrics = [
    metric("patients", "Пациентов в базе", patientsInBase),
    metric("booked", "Записано на консультацию", booked),
    metric("came", "Пришли", came),
    metric("no_show", "Не пришли", noShow),
    metric("cancelled", "Отменили", cancelled),
    metric("referred", "Направлены с общего профиля в хирургию", referred),
    metric("op_booked", "Записались на операцию", opBooked),
    metric("op_done", "Операции состоялись", opDone, opDone.reduce((a, r) => a + r.amount, 0)),
  ];
  const v = (k: string) => metrics.find((m) => m.key === k)?.value ?? 0;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const byEmployee = group(booked, (r) => r.employee);
  // Flows: consecutive non-deleted records of one patient ordered by visit time, where the branch or doctor changes.
  const flows = new Map<string, Set<string>>();
  for (const [phone, list] of byPatient) {
    const sorted = list.filter(match).sort((a, b) => (a.visit_at ?? "").localeCompare(b.visit_at ?? ""));
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!, b = sorted[i]!;
      if (!inPeriod(b.visit_at, f)) continue;
      if (a.branch_code !== b.branch_code) add(flows, `Филиал: ${a.branch_code ?? "—"} → ${b.branch_code ?? "—"}`, phone);
      if (a.staff !== b.staff) add(flows, `Врач: ${a.staff} → ${b.staff}`, phone);
    }
  }
  return {
    metrics, byEmployee,
    conversions: { bookedToCame: pct(v("came"), v("booked")), cameToOperation: pct(v("op_done"), v("came")) },
    flows: [...flows].map(([label, set]) => ({ label, value: set.size, patients: [...set] })).sort((a, b) => b.value - a.value),
  };
}
function add(m: Map<string, Set<string>>, k: string, p: string) { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(p); }
function group(rows: FunnelRecord[], key: (r: FunnelRecord) => string) {
  const m = new Map<string, FunnelRecord[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m].map(([label, list]) => ({ label, value: uniq(list).length, patients: uniq(list) })).sort((a, b) => b.value - a.value);
}
