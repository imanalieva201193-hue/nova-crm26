import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import { type Lead } from "@/components/crm/data";
import {
  bishkekDate,
  checkupFunnelSteps,
  checkupStats,
  estimateTotals,
  fmtDate,
  fmtMoney,
  leadRevenue,
  periodRange,
  stageLabel,
  type PeriodKind,
} from "@/lib/crm";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/checkup")({
  head: () => ({
    meta: [
      { title: "Чекап — 2 этаж — Nova CRM" },
      {
        name: "description",
        content: "Чекап на Абдумомунова, 2 этаж: лиды, записи, посещения, выручка и отчёт за день.",
      },
      { property: "og:title", content: "Чекап — 2 этаж — Nova CRM" },
      {
        property: "og:description",
        content: "Чекап на Абдумомунова, 2 этаж: лиды, записи, посещения, выручка и отчёт за день.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckupPage,
});

function CheckupPage() {
  const { openLead } = useCrm();
  const [kind, setKind] = useState<PeriodKind>("month");
  const [date, setDate] = useState(bishkekDate());
  const range = periodRange(kind, date);

  const { data, isLoading } = useQuery({
    queryKey: ["checkup", range.from, range.to],
    queryFn: async () => {
      const leads: Lead[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("branch_code", "abd2")
          .eq("funnel", "nova_check")
          .gte("lead_date", range.from)
          .lte("lead_date", range.to)
          .order("lead_date", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        leads.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const items: Record<string, { name: string; qty: number; price: number; currency: string; discount: number; is_package: boolean }[]> = {};
      const ids = leads.map((l) => l.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from("lead_services")
          .select("lead_id, name, qty, price, currency, discount, is_package")
          .in("lead_id", ids.slice(i, i + 200));
        for (const r of data ?? []) (items[r.lead_id] ??= []).push(r);
      }
      const revenue: Record<string, number> = {};
      for (const l of leads) revenue[l.id] = leadRevenue(l, items[l.id] ?? [], l.foreigner);
      return { leads, items, revenue };
    },
  });

  const leads = data?.leads ?? [];
  const stats = useMemo(
    () => (data ? checkupStats(leads, data.revenue) : null),
    [data, leads],
  );
  const steps = useMemo(() => checkupFunnelSteps(leads), [leads]);
  const dayLeads = leads.filter((l) => l.lead_date === date);
  const dayStats = useMemo(
    () => (data ? checkupStats(dayLeads, data.revenue) : null),
    [data, dayLeads],
  );

  const costOf = (l: Lead) => {
    if (l.operation_cost) return fmtMoney(Number(l.operation_cost));
    const items = data?.items[l.id] ?? [];
    if (items.length) {
      const t = estimateTotals(items, l.foreigner);
      return t.kgs ? fmtMoney(t.kgs) : "—";
    }
    if (l.prepayment) return fmtMoney(Number(l.prepayment));
    return "—";
  };
  const kindOf = (l: Lead) => data?.items[l.id]?.[0]?.name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Абдумомунова, 2 этаж
        </div>
        <h1 className="font-display text-4xl font-bold">Чекап — 2 этаж</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted p-1">
          {(["day", "month"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-4 py-1.5 text-sm ${kind === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {k === "day" ? "День" : "Месяц"}
            </button>
          ))}
        </div>
        <Input
          type="date"
          className="w-40"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>

      {isLoading || !stats ? (
        <p className="text-muted-foreground">Считаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Лидов на чекап" value={stats.leads} />
            <Kpi label="Записались" value={stats.booked} />
            <Kpi label="Подтвердили запись" value={stats.confirmed} />
            <Kpi label="Фактически пришли" value={stats.came} />
            <Kpi label="Прошли чекап полностью" value={stats.done} />
            <Kpi label="Отменили запись" value={stats.cancelled} />
            <Kpi label="Не пришли" value={stats.noShow} />
            <Kpi label="В работе" value={stats.inWork} />
            <Kpi label="Повторные пациенты" value={stats.repeat} />
            <Kpi label="Выручка по завершённым" value={fmtMoney(stats.revenue)} />
          </div>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-display text-lg font-bold">Воронка чекапа</h2>
            <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 md:flex-1">
                  <div className="flex-1 rounded-xl bg-muted p-3 text-center">
                    <div className="font-display text-2xl font-bold">{s.count}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="shrink-0 text-xs font-semibold text-primary md:-mx-1">
                      {steps[i + 1]?.conv}% →
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {kind === "day" && dayStats && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-2 font-display text-lg font-bold">
                Отчёт за {fmtDate(date)}
              </h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm md:grid-cols-3">
                <div>
                  Лидов — <b>{dayStats.leads}</b>
                </div>
                <div>
                  Записались — <b>{dayStats.booked}</b>
                </div>
                <div>
                  Пришли — <b>{dayStats.came}</b>
                </div>
                <div>
                  Завершили чекап — <b>{dayStats.done}</b>
                </div>
                <div>
                  Не пришли — <b>{dayStats.noShow}</b>
                </div>
                <div>
                  Выручка — <b>{fmtMoney(dayStats.revenue)}</b>
                </div>
              </div>
            </section>
          )}

          <section className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  {[
                    "Дата обращения",
                    "ФИО",
                    "Телефон",
                    "Источник",
                    "Вид чекапа",
                    "Стоимость",
                    "Дата записи",
                    "Статус",
                    "Ответственный",
                    "Комментарий",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => openLead(l.id)}
                    className="cursor-pointer border-t hover:bg-muted/50"
                  >
                    <td className="px-3 py-2">{fmtDate(l.lead_date)}</td>
                    <td className="px-3 py-2 font-medium">{l.patient_name}</td>
                    <td className="px-3 py-2">{l.phone}</td>
                    <td className="px-3 py-2">{l.source}</td>
                    <td className="max-w-40 truncate px-3 py-2">{kindOf(l)}</td>
                    <td className="px-3 py-2">{costOf(l)}</td>
                    <td className="px-3 py-2">{fmtDate(l.visit_date)}</td>
                    <td className="px-3 py-2">{l.outcome ?? stageLabel(l.funnel, l.stage)}</td>
                    <td className="max-w-32 truncate px-3 py-2">{l.responsible_email}</td>
                    <td className="max-w-48 truncate px-3 py-2 text-muted-foreground">
                      {l.comment}
                    </td>
                  </tr>
                ))}
                {!leads.length && (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                      За этот период пациентов на чекап нет.
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

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
