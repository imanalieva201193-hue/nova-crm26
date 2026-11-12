import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  reanimationCandidates,
  reportStats,
  reportText,
  type Group,
  type PeriodKind,
} from "@/lib/crm";
import { summarizeReport } from "@/lib/report-ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Отчёты — Nova CRM" },
      {
        name: "description",
        content: "Сводка продаж за день, месяц и год с AI-анализом и реанимацией базы.",
      },
      { property: "og:title", content: "Отчёты — Nova CRM" },
      {
        property: "og:description",
        content: "Сводка продаж за день, месяц и год с AI-анализом и реанимацией базы.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function ReportsPage() {
  const { branch, isAdmin } = useCrm();
  const [kind, setKind] = useState<PeriodKind>("month");
  const [date, setDate] = useState(bishkekDate());
  const range = periodRange(kind, date);
  const title = `${PERIOD_LABEL[kind].toLowerCase()} ${kind === "day" ? fmtDate(date) : kind === "month" ? date.slice(0, 7) : date.slice(0, 4)}${branch !== "all" ? `, ${branchName(branch)}` : ""}`;

  const { data, isLoading } = useQuery({
    queryKey: ["report", branch, range.from, range.to],
    queryFn: async () => {
      const leads: Lead[] = [];
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
  const stats = useMemo(() => (data ? reportStats(data.leads, data.revenue) : null), [data]);
  const text = stats ? reportText(stats, title) : "";

  const summarize = useServerFn(summarizeReport);
  const [ai, setAi] = useState<{ loading?: boolean; text?: string; error?: string }>({});
  async function runAi() {
    setAi({ loading: true });
    const r = await summarize({ data: { text } }).catch(() => ({
      ok: false as const,
      error: "Не удалось получить сводку",
    }));
    setAi(r.ok ? { text: r.text } : { error: r.error });
  }

  const employees = useQuery(employeesQ).data ?? [];
  const leaders = employees.filter(
    (e) => e.active && (e.role === "rop" || e.role === "commercial_director"),
  );
  const fullText = text + (ai.text ? `\n\nAI-сводка:\n${ai.text}` : "");
  const subject = `Отчёт Nova CRM — ${title}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Аналитика продаж</div>
          <h1 className="font-display text-4xl font-bold">Сводка</h1>
        </div>
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
      </div>

      {isLoading || !stats ? (
        <p className="text-muted-foreground">Считаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Заявок" value={stats.leads} hint={`мусорных ${stats.trash}`} />
            <Kpi label="Продаж (финал)" value={stats.won} hint={`пришли ${stats.came}`} />
            <Kpi
              label="Конверсия"
              value={`${stats.conv}%`}
              hint={`потеряно ${stats.lost}, не пришли ${stats.noShow}`}
            />
            <Kpi
              label="Выручка"
              value={fmtMoney(stats.revenue)}
              hint={`средний чек ${fmtMoney(stats.avgCheck)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <GroupTable title="По менеджерам" rows={stats.byManager} />
            <GroupTable title="По каналам" rows={stats.byChannel} />
            <GroupTable title="По филиалам" rows={stats.byBranch} />
          </div>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-display text-lg font-bold">AI-анализ за {title}</h2>
              <Button onClick={runAi} disabled={ai.loading || !stats.leads}>
                {ai.loading ? "Анализирую…" : ai.text ? "Обновить анализ" : "Сделать анализ"}
              </Button>
            </div>
            {ai.error && <p className="text-sm text-destructive">{ai.error}</p>}
            {ai.text ? (
              <p className="whitespace-pre-wrap text-sm">{ai.text}</p>
            ) : (
              !ai.error && (
                <p className="text-sm text-muted-foreground">
                  {stats.leads
                    ? "Нажмите «Сделать анализ» — AI разберёт цифры и подскажет, что делать."
                    : "За этот период заявок нет."}
                </p>
              )
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1 font-display text-lg font-bold">Рассылка руководителям</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Отчёт {ai.text ? "с AI-сводкой " : ""}для:{" "}
              {leaders.map((l) => l.full_name || l.email).join(", ") ||
                "РОП и коммерческий директор не добавлены в Админке"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(fullText)
                    .then(() => toast.success("Отчёт скопирован"))
                }
              >
                Скопировать
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(fullText)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </Button>
              <Button variant="outline" asChild disabled={!leaders.length}>
                <a
                  href={`mailto:${leaders.map((l) => l.email).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullText)}`}
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

function Kpi({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
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
      await supabase
        .from("lead_history")
        .insert(
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
