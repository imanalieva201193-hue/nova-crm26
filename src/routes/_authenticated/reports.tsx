import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import { employeesQ, type Lead } from "@/components/crm/data";
import {
  PERIOD_LABEL,
  REANIMATION,
  REANIMATION_AFTER_DAYS,
  bishkekDate,
  branchName,
  fmtDate,
  fmtMoney,
  leadRevenue,
  periodRange,
  prevRange,
  reanimationCandidates,
  reportStats,
  reportText,
  toCSV,
  type Group,
  type PeriodKind,
  type ReportStats,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Sparkles } from "lucide-react";
import { summarizeReport } from "@/lib/report-ai.functions";
import { contributionReport } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Отчёты — Nova CRM" },
      {
        name: "description",
        content:
          "Автоматические отчёты за день, неделю, месяц и год: по отделам, сотрудникам и источникам, со сравнением периодов и выгрузкой в Excel.",
      },
      { property: "og:title", content: "Отчёты — Nova CRM" },
      {
        property: "og:description",
        content:
          "Автоматические отчёты за день, неделю, месяц и год: по отделам, сотрудникам и источникам, со сравнением периодов и выгрузкой в Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Автоматические отчёты
        </div>
        <h1 className="font-display text-4xl font-bold">Отчёты</h1>
      </div>
      <SummaryReport />
    </div>
  );
}

function useReportData(branch: string, from: string, to: string) {
  return useQuery({
    queryKey: ["report", branch, from, to],
    queryFn: async () => {
      const leads: Lead[] = [];
      for (let off = 0; ; off += 1000) {
        let q = supabase
          .from("leads")
          .select("*")
          .gte("lead_date", from)
          .lte("lead_date", to)
          .range(off, off + 999);
        if (branch !== "all") q = q.eq("branch_code", branch);
        const { data, error } = await q;
        if (error) throw error;
        leads.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const won = leads.filter((l) => l.stage === 10 && !l.operation_cost).map((l) => l.id);
      const items: Record<
        string,
        {
          name: string;
          qty: number;
          price: number;
          currency: string;
          discount: number;
          is_package: boolean;
        }[]
      > = {};
      for (let i = 0; i < won.length; i += 200) {
        const { data } = await supabase
          .from("lead_services")
          .select("lead_id, name, qty, price, currency, discount, is_package")
          .in("lead_id", won.slice(i, i + 200));
        for (const r of data ?? []) (items[r.lead_id] ??= []).push(r);
      }
      const revenue: Record<string, number> = {};
      for (const l of leads) revenue[l.id] = leadRevenue(l, items[l.id] ?? [], l.foreigner);
      return { leads, revenue };
    },
  });
}

function SummaryReport() {
  const { branch, isAdmin } = useCrm();
  const [kind, setKind] = useState<PeriodKind>("month");
  const [date, setDate] = useState(bishkekDate());
  const range = periodRange(kind, date);
  const prev = prevRange(kind, date);
  const periodText =
    kind === "day"
      ? fmtDate(date)
      : kind === "week"
        ? `${fmtDate(range.from)}–${fmtDate(range.to)}`
        : kind === "month"
          ? date.slice(0, 7)
          : date.slice(0, 4);
  const title = `${PERIOD_LABEL[kind].toLowerCase()} ${periodText}${branch !== "all" ? `, ${branchName(branch)}` : ""}`;

  const cur = useReportData(branch, range.from, range.to);
  const prv = useReportData(branch, prev.from, prev.to);
  const stats = useMemo(
    () => (cur.data ? reportStats(cur.data.leads, cur.data.revenue) : null),
    [cur.data],
  );
  const prevStats = useMemo(
    () => (prv.data ? reportStats(prv.data.leads, prv.data.revenue) : null),
    [prv.data],
  );
  const text = stats ? reportText(stats, title) : "";

  const employees = useQuery(employeesQ).data ?? [];
  const leaders = employees.filter(
    (e) => e.active && (e.role === "rop" || e.role === "commercial_director"),
  );
  const subject = `Отчёт Nova CRM — ${title}`;

  function exportExcel() {
    if (!stats) return;
    const rows: Record<string, unknown>[] = [
      { Раздел: "Итоги", Показатель: "Заявок", Значение: stats.leads },
      { Раздел: "Итоги", Показатель: "Мусорных", Значение: stats.trash },
      { Раздел: "Итоги", Показатель: "Продаж (финал)", Значение: stats.won },
      { Раздел: "Итоги", Показатель: "Пришли", Значение: stats.came },
      { Раздел: "Итоги", Показатель: "Потеряно", Значение: stats.lost },
      { Раздел: "Итоги", Показатель: "Не пришли", Значение: stats.noShow },
      { Раздел: "Итоги", Показатель: "Конверсия, %", Значение: stats.conv },
      { Раздел: "Итоги", Показатель: "Выручка, сом", Значение: stats.revenue },
      { Раздел: "Итоги", Показатель: "Средний чек, сом", Значение: stats.avgCheck },
    ];
    const add = (name: string, list: Group[]) => {
      for (const g of list)
        rows.push({
          Раздел: name,
          Показатель: g.key,
          Значение: `${g.leads} заявок, ${g.won} продаж (${g.conv}%), ${g.revenue} сом`,
        });
    };
    add("По менеджерам", stats.byManager);
    add("По каналам", stats.byChannel);
    add("По филиалам", stats.byBranch);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }));
    a.download = `отчёт_${range.from}_${range.to}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted p-1">
          {(Object.keys(PERIOD_LABEL) as PeriodKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-4 py-1.5 text-sm ${kind === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {PERIOD_LABEL[k]}
            </button>
          ))}
        </div>
        <Input
          type="date"
          className="w-40"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportExcel}
          disabled={!stats}
        >
          <Download className="size-4" />
          Excel / CSV
        </Button>
      </div>

      {cur.isLoading || !stats ? (
        <p className="text-muted-foreground">Считаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Заявок"
              value={stats.leads}
              hint={`мусорных ${stats.trash}`}
              prev={prevStats?.leads}
            />
            <Kpi
              label="Продаж (финал)"
              value={stats.won}
              hint={`пришли ${stats.came}`}
              prev={prevStats?.won}
            />
            <Kpi
              label="Конверсия"
              value={`${stats.conv}%`}
              hint={`потеряно ${stats.lost}, не пришли ${stats.noShow}`}
              prev={prevStats ? `${prevStats.conv}%` : undefined}
            />
            <Kpi
              label="Выручка"
              value={fmtMoney(stats.revenue)}
              hint={`средний чек ${fmtMoney(stats.avgCheck)}`}
              prev={prevStats ? fmtMoney(prevStats.revenue) : undefined}
            />
          </div>
          {prevStats && (
            <p className="text-xs text-muted-foreground">
              Сравнение с предыдущим периодом ({fmtDate(prev.from)}–{fmtDate(prev.to)}): заявок{" "}
              {delta(stats.leads - prevStats.leads)}, продаж {delta(stats.won - prevStats.won)},
              выручка {delta(fmtMoney(stats.revenue - prevStats.revenue))}.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <GroupTable title="По менеджерам" rows={stats.byManager} />
            <GroupTable title="По каналам" rows={stats.byChannel} />
            <GroupTable title="По филиалам" rows={stats.byBranch} />
          </div>

          <ContributionTable leads={cur.data?.leads ?? []} />
          <AiSummary text={text} />

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1 font-display text-lg font-bold">Рассылка руководителям</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Отчёт для:{" "}
              {leaders.map((l) => l.full_name || l.email).join(", ") ||
                "РОП и коммерческий директор не добавлены в раздел «Сотрудники»"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(text).then(() => toast.success("Отчёт скопирован"))
                }
              >
                Скопировать
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </Button>
              <Button variant="outline" asChild disabled={!leaders.length}>
                <a
                  href={`mailto:${leaders.map((l) => l.email).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}
                >
                  Письмом
                </a>
              </Button>
            </div>
          </section>
        </>
      )}

      <Reanimation canAssign={isAdmin} reanimators={employees.filter((e) => e.active)} />
    </div>
  );
}

const delta = (v: number | string) => (typeof v === "number" ? (v > 0 ? `+${v}` : `${v}`) : v);

function Kpi({
  label,
  value,
  hint,
  prev,
}: {
  label: string;
  value: string | number;
  hint: string;
  prev?: string | number | undefined;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
      {prev !== undefined && (
        <div className="text-xs text-muted-foreground">прошлый период: {prev}</div>
      )}
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-normal">Кто / что</th>
            <th className="text-right font-normal">Заявки</th>
            <th className="text-right font-normal">Конв.</th>
            <th className="text-right font-normal">Выручка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="max-w-40 truncate py-1">{r.key}</td>
              <td className="text-right">{r.leads}</td>
              <td className="text-right">{r.conv}%</td>
              <td className="text-right">{fmtMoney(r.revenue)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="py-2 text-muted-foreground">
                Нет данных
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Reanimation({
  canAssign,
  reanimators,
}: {
  canAssign: boolean;
  reanimators: { email: string; full_name: string; role: string }[];
}) {
  const { branch, openLead, me } = useCrm();
  const qc = useQueryClient();
  const today = bishkekDate();
  const { data: pool = [] } = useQuery({
    queryKey: ["reanimation-pool", branch],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("*")
        .in("outcome", ["Потерянный", "Не пришёл"])
        .order("lead_date")
        .limit(1000);
      if (branch !== "all") q = q.eq("branch_code", branch);
      const { data, error } = await q;
      if (error) throw error;
      return reanimationCandidates(data ?? [], today);
    },
  });
  const [picked, setPicked] = useState<string[]>([]);
  const sorted = [...reanimators].sort(
    (a, b) => Number(b.role === "reanimator") - Number(a.role === "reanimator"),
  );
  const [who, setWho] = useState("");
  const assignee = who || sorted[0]?.email || me.email;
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const ids = picked.length ? picked : pool.map((l) => l.id);
    const { error } = await supabase
      .from("leads")
      .update({
        stage: REANIMATION,
        outcome: null,
        outcome_reason: null,
        responsible_email: canAssign ? assignee : me.email,
        next_touch: today,
      })
      .in("id", ids);
    if (!error)
      await supabase.from("lead_history").insert(
        ids.map((id) => ({
          lead_id: id,
          author_email: me.email,
          changes: { reanimation: { to: canAssign ? assignee : me.email } },
        })),
      );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`В реанимацию отправлено: ${ids.length}`);
    setPicked([]);
    qc.invalidateQueries();
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-1 font-display text-lg font-bold">Реанимация базы — повторный список</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Потерянные и не пришедшие пациенты старше {REANIMATION_AFTER_DAYS} дней. Отправленные
        получают этап «Реанимация базы» и задачу на сегодня.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">
          Найдено: <b>{pool.length}</b>
          {picked.length ? `, выбрано ${picked.length}` : ""}
        </span>
        {canAssign && (
          <select className={sel} value={assignee} onChange={(e) => setWho(e.target.value)}>
            {sorted.map((r) => (
              <option key={r.email} value={r.email}>
                {r.full_name || r.email}
                {r.role === "reanimator" ? " (реаниматор)" : ""}
              </option>
            ))}
          </select>
        )}
        <Button disabled={busy || !pool.length} onClick={send}>
          {busy ? "Отправляю…" : picked.length ? "Отправить выбранных" : "Отправить всех"}
        </Button>
      </div>
      <div className="max-h-96 divide-y overflow-y-auto text-sm">
        {pool.map((l) => (
          <div key={l.id} className="flex items-center gap-3 py-1.5">
            <Checkbox
              checked={picked.includes(l.id)}
              onCheckedChange={(c) =>
                setPicked(c ? [...picked, l.id] : picked.filter((x) => x !== l.id))
              }
            />
            <button className="font-medium hover:underline" onClick={() => openLead(l.id)}>
              {l.patient_name || l.phone}
            </button>
            <span className="text-muted-foreground">
              {l.outcome}
              {l.outcome_reason ? `: ${l.outcome_reason}` : ""}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {branchName(l.branch_code)} · {fmtDate(l.lead_date)}
            </span>
          </div>
        ))}
        {!pool.length && <p className="py-2 text-muted-foreground">Сейчас некого реанимировать.</p>}
      </div>
    </section>
  );
}

function ContributionTable({ leads }: { leads: Lead[] }) {
  const rows = contributionReport(leads);
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-display text-lg font-bold">Вклад сотрудников</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Одна карточка на пациента: каждый шаг засчитывается один раз тому, кто его сделал.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Сотрудник</th>
              <th>Привёл</th>
              <th>Записал</th>
              <th>Подтвердил</th>
              <th>Довёл до операции</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email} className="border-t">
                <td className="py-1.5">{r.email}</td>
                <td>{r.brought}</td>
                <td>{r.booked}</td>
                <td>{r.confirmed}</td>
                <td className="font-semibold">{r.operations}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  Нет данных за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AiSummary({ text }: { text: string }) {
  const [st, setSt] = useState<{ loading: boolean; text?: string; error?: string }>({
    loading: false,
  });
  async function run() {
    setSt({ loading: true });
    const r = await summarizeReport({ data: { text } }).catch(() => ({
      ok: false as const,
      error: "Не удалось получить сводку",
    }));
    setSt(r.ok ? { loading: false, text: r.text } : { loading: false, error: r.error });
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">AI-анализ периода</h2>
        <Button size="sm" onClick={run} disabled={st.loading || !text}>
          <Sparkles className="mr-1 h-4 w-4" />
          {st.loading ? "Анализирую…" : "Проанализировать"}
        </Button>
      </div>
      {st.error && <p className="text-sm text-destructive">{st.error}</p>}
      {st.text ? (
        <div className="text-sm whitespace-pre-wrap">{st.text}</div>
      ) : (
        !st.error && (
          <p className="text-sm text-muted-foreground">
            AI разберёт цифры за период: что хорошо, где проблемы и что сделать дальше.
          </p>
        )
      )}
    </section>
  );
}
