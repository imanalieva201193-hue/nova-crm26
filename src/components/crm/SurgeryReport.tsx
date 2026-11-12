import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import { useDoctors, type Lead } from "@/components/crm/data";
import {
  bishkekDate,
  fmtMoney,
  periodRange,
  surgeonReport,
  surgeryDaily,
  surgeryTotal,
  type SurgeryDay,
} from "@/lib/crm";
import { Input } from "@/components/ui/input";

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function SurgeryReport() {
  const { branch } = useCrm();
  const br = branch === "all" ? "abd3" : branch;
  const [month, setMonth] = useState(bishkekDate().slice(0, 7));
  const range = periodRange("month", month + "-01");
  const doctors = useDoctors();

  const { data, isLoading } = useQuery({
    queryKey: ["surgery-report", br, month],
    queryFn: async () => {
      // leads that had any event this month: requested, consult, or operation in range
      const leads: Lead[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("branch_code", br)
          .or(
            `and(lead_date.gte.${range.from},lead_date.lte.${range.to}),and(visit_date.gte.${range.from},visit_date.lte.${range.to}T23:59:59),and(operation_date.gte.${range.from},operation_date.lte.${range.to}),and(prepayment_date.gte.${range.from},prepayment_date.lte.${range.to})`,
          )
          .range(from, from + 999);
        if (error) throw error;
        leads.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const ids = new Set(leads.map((l) => l.id));
      const { data: hist } = await supabase
        .from("lead_history")
        .select("lead_id, changed_at, changes")
        .gte("changed_at", range.from)
        .lte("changed_at", range.to + "T23:59:59")
        .limit(5000);
      const resched = (hist ?? [])
        .filter(
          (h) =>
            ids.has(h.lead_id) &&
            h.changes &&
            typeof h.changes === "object" &&
            "visit_date" in h.changes,
        )
        .map((h) => h.changed_at);
      return { leads, resched };
    },
  });

  const days = data ? surgeryDaily(data.leads, range.from, range.to, data.resched) : [];
  const total = surgeryTotal(days);
  const ofMonth = (data?.leads ?? []).filter(
    (l) => l.lead_date >= range.from && l.lead_date <= range.to,
  );
  const surgeons = surgeonReport(ofMonth);
  const docName = (id: string) => doctors.find((d) => d.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Формат отчёта менеджеров хирургии. Филиал: {br === "abd3" ? "Абдумомунова, 3 этаж" : br}
        </p>
        <Input
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Считаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Запросы" value={total.requests} />
            <Card
              label="Консультаций проведено"
              value={total.heldConsult}
              hint={`записано ${total.bookedConsult}`}
            />
            <Card
              label="Записались на операцию"
              value={total.bookedOp}
              hint={`состоялось ${total.doneOp}`}
            />
            <Card
              label="Конверсия конс. → опер."
              value={`${total.conv}%`}
              hint={`отказы ${total.refusals}, переносы ${total.reschedules}`}
            />
          </div>

          <section className="overflow-x-auto rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-display text-lg font-bold">Ежедневный отчёт</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {[
                    "Дата",
                    "День",
                    "Запросы",
                    "Записаны на конс.",
                    "Проведено конс.",
                    "Записались на опер.",
                    "Операции состоялись",
                    "Отказы",
                    "Переносы",
                    "Конверсия",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`py-1 font-normal ${i < 2 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <Row key={d.date} d={d} />
                ))}
                <Row d={total} bold />
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-display text-lg font-bold">Результат по каждому хирургу</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {[
                    "Хирург",
                    "Записаны на конс.",
                    "Проведено конс.",
                    "Записались на опер.",
                    "Операции состоялись",
                    "Конверсия",
                    "Доходимость",
                    "Сумма операций",
                    "Предоплаты",
                  ].map((h, i) => (
                    <th key={h} className={`py-1 font-normal ${i ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {surgeons.map((r) => (
                  <tr key={r.doctorId} className="border-t">
                    <td className="py-1">{docName(r.doctorId)}</td>
                    <td className="text-right">{r.bookedConsult}</td>
                    <td className="text-right">{r.heldConsult}</td>
                    <td className="text-right">{r.bookedOp}</td>
                    <td className="text-right">{r.doneOp}</td>
                    <td className="text-right">{r.conv}%</td>
                    <td className="text-right">{r.reach}%</td>
                    <td className="text-right">{r.sum ? fmtMoney(r.sum) : "—"}</td>
                    <td className="text-right">{r.prepay ? fmtMoney(r.prepay) : "—"}</td>
                  </tr>
                ))}
                {!surgeons.length && (
                  <tr>
                    <td colSpan={9} className="py-2 text-muted-foreground">
                      Нет данных
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

function Row({ d, bold }: { d: SurgeryDay; bold?: boolean }) {
  const empty =
    !bold && !d.requests && !d.bookedConsult && !d.heldConsult && !d.bookedOp && !d.doneOp;
  return (
    <tr className={`border-t ${bold ? "font-bold" : ""} ${empty ? "text-muted-foreground" : ""}`}>
      <td className="py-1">
        {bold ? "Итого за месяц" : d.date.slice(8) + "." + d.date.slice(5, 7)}
      </td>
      <td>{bold ? "" : WD[new Date(d.date + "T12:00:00Z").getUTCDay()]}</td>
      <td className="text-right">{d.requests}</td>
      <td className="text-right">{d.bookedConsult}</td>
      <td className="text-right">{d.heldConsult}</td>
      <td className="text-right">{d.bookedOp}</td>
      <td className="text-right">{d.doneOp}</td>
      <td className="text-right">{d.refusals}</td>
      <td className="text-right">{d.reschedules}</td>
      <td className="text-right">{d.conv}%</td>
    </tr>
  );
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
