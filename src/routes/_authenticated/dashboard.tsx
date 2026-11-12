import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import { employeesQ, type Lead } from "@/components/crm/data";
import {
  CHANNELS,
  FUNNELS,
  bishkekDate,
  dashStats,
  funnelSteps,
  openTasks,
  type FunnelCode,
} from "@/lib/crm";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Главная — Nova CRM" },
      {
        name: "description",
        content: "Панель руководителя за период: лиды, записи, посещения, операции и конверсии.",
      },
      { property: "og:title", content: "Главная — Nova CRM" },
      {
        property: "og:description",
        content: "Панель руководителя за период: лиды, записи, посещения, операции и конверсии.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";
type Preset = "today" | "yesterday" | "month" | "custom";
const PRESETS: [Preset, string][] = [
  ["today", "Сегодня"],
  ["yesterday", "Вчера"],
  ["month", "Месяц"],
  ["custom", "Период"],
];

function DashboardPage() {
  const { branch, openLead } = useCrm();
  const today = bishkekDate();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + "01", to: today });
  const [employee, setEmployee] = useState("");
  const [source, setSource] = useState("");
  const [direction, setDirection] = useState("");

  const range =
    preset === "today"
      ? { from: today, to: today }
      : preset === "yesterday"
        ? {
            from: bishkekDate(new Date(Date.now() - 86400_000)),
            to: bishkekDate(new Date(Date.now() - 86400_000)),
          }
        : preset === "month"
          ? { from: today.slice(0, 8) + "01", to: today }
          : custom;

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["dash", branch, range.from, range.to],
    queryFn: async () => {
      const out: Lead[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from("leads")
          .select("*")
          .gte("lead_date", range.from)
          .lte("lead_date", range.to)
          .range(from, from + 999);
        if (branch !== "all") q = q.eq("branch_code", branch);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return out;
    },
  });

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) =>
          (!employee || l.responsible_email === employee) &&
          (!source || l.source === source) &&
          (!direction || l.funnel === direction),
      ),
    [leads, employee, source, direction],
  );
  const stats = useMemo(() => dashStats(filtered), [filtered]);
  const steps = useMemo(() => funnelSteps(filtered), [filtered]);

  const employees = useQuery(employeesQ).data ?? [];
  const byEmployee = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of filtered)
      m.set(l.responsible_email || "Без ответственного", [
        ...(m.get(l.responsible_email || "Без ответственного") ?? []),
        l,
      ]);
    return [...m.entries()]
      .map(([email, ls]) => ({ email, s: dashStats(ls) }))
      .sort((a, b) => b.s.leads - a.s.leads);
  }, [filtered]);

  const openQ = useQuery({
    queryKey: ["open-tasks", branch],
    queryFn: async () => {
      let q = supabase.from("leads").select("*").is("outcome", null).neq("stage", 10).limit(2000);
      if (branch !== "all") q = q.eq("branch_code", branch);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const overdue = useMemo(() => {
    const m = new Map<string, { l: Lead; tasks: string[] }[]>();
    for (const l of openQ.data ?? []) {
      if (employee && l.responsible_email !== employee) continue;
      const tasks = openTasks(l, today);
      if (!tasks.length) continue;
      const k = l.responsible_email || "Без ответственного";
      m.set(k, [...(m.get(k) ?? []), { l, tasks }]);
    }
    return [...m.entries()]
      .map(([email, items]) => ({ email, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [openQ.data, employee, today]);

  const nameOf = (email: string) => employees.find((e) => e.email === email)?.full_name || email;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Панель руководителя
        </div>
        <h1 className="font-display text-4xl font-bold">NOVA CRM</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted p-1">
          {PRESETS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPreset(k)}
              className={`rounded-lg px-4 py-1.5 text-sm ${preset === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <>
            <Input
              type="date"
              className="w-40"
              value={custom.from}
              onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
            />
            <Input
              type="date"
              className="w-40"
              value={custom.to}
              onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
            />
          </>
        )}
        <select className={sel} value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">Все сотрудники</option>
          {employees
            .filter((e) => e.active)
            .map((e) => (
              <option key={e.email} value={e.email}>
                {e.full_name || e.email}
              </option>
            ))}
        </select>
        <select className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Все источники</option>
          {CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className={sel} value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="">Все направления</option>
          {Object.entries(FUNNELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Считаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b pb-8 md:grid-cols-3">
            <Big label="Лидов" value={stats.leads} />
            <Big label="Записались" value={stats.bookedConsult} />
            <Big label="Пришли" value={stats.cameConsult} />
            <Big label="Записаны на операцию" value={stats.bookedOp} />
            <Big label="Операций проведено" value={stats.doneOp} />
            <Big label="Не пришли" value={stats.noShow} />
            <Big label="Отказы" value={stats.refusals} />
          </div>

          <section className="space-y-4 border-b pb-8">
            <h2 className="font-display text-xl font-bold">Воронка пациентов</h2>
            {steps.map((s) => (
              <div key={s.key}>
                <div className="mb-2 flex justify-between">
                  <span>{s.label}</span>
                  <span className="font-semibold">{s.count}</span>
                </div>
                <div className="h-3 rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-primary/70"
                    style={{ width: `${steps[0]?.count ? (s.count / steps[0].count) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4 border-b pb-8">
            <h2 className="font-display text-xl font-bold">Конверсия</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border p-5">
                <div className="font-display text-3xl font-bold">{stats.convLeadConsult}%</div>
                <div className="text-sm text-muted-foreground">Из лида в запись</div>
              </div>
              <div className="rounded-2xl border p-5">
                <div className="font-display text-3xl font-bold">{stats.convConsultOp}%</div>
                <div className="text-sm text-muted-foreground">
                  Из консультации в запись на операцию
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-b pb-8">
            <h2 className="font-display text-xl font-bold">Не выполнено сотрудниками</h2>
            {!overdue.length ? (
              <p className="text-sm text-muted-foreground">Все задачи закрыты</p>
            ) : (
              <div className="divide-y rounded-2xl border border-destructive/40">
                {overdue.map((o) => (
                  <div key={o.email} className="p-4">
                    <div className="mb-2 flex justify-between font-medium">
                      <span>{nameOf(o.email)}</span>
                      <span className="font-bold text-destructive">{o.items.length}</span>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {o.items.slice(0, 5).map((it) => (
                        <li key={it.l.id}>
                          <button
                            className="text-left text-destructive hover:underline"
                            onClick={() => openLead(it.l.id)}
                          >
                            {it.l.patient_name || it.l.phone} — {it.tasks.join("; ")}
                          </button>
                        </li>
                      ))}
                      {o.items.length > 5 && (
                        <li className="text-xs text-muted-foreground">
                          и ещё {o.items.length - 5}
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-x-auto">
            <h2 className="mb-2 font-display text-lg font-bold">Результат каждого сотрудника</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {[
                    "Сотрудник",
                    "Лиды",
                    "Записи",
                    "Пришли",
                    "На операцию",
                    "Операции",
                    "Отказы",
                    "Конв. лид→конс.",
                  ].map((h, i) => (
                    <th key={h} className={`py-1 font-normal ${i ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((r) => (
                  <tr key={r.email} className="border-t">
                    <td className="max-w-48 truncate py-1">{nameOf(r.email)}</td>
                    <td className="text-right">{r.s.leads}</td>
                    <td className="text-right">{r.s.bookedConsult}</td>
                    <td className="text-right">{r.s.cameConsult}</td>
                    <td className="text-right">{r.s.bookedOp}</td>
                    <td className="text-right">{r.s.doneOp}</td>
                    <td className="text-right">{r.s.refusals}</td>
                    <td className="text-right">{r.s.convLeadConsult}%</td>
                  </tr>
                ))}
                {!byEmployee.length && (
                  <tr>
                    <td colSpan={8} className="py-2 text-muted-foreground">
                      Нет данных за период
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Big({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-4xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
