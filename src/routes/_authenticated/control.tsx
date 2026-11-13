import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCrm } from "@/components/crm/context";
import { workspaceDataQ, employeesQ } from "@/components/crm/data";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, bishkekDate, openTasks, periodRange, type PeriodKind } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { exportWorkbook } from "@/components/crm/workspace-export";
import { toast } from "sonner";
export const Route = createFileRoute("/_authenticated/control")({
  head: () => ({
    meta: [
      { title: "Контроль сотрудников — NOVA CRM" },
      {
        name: "description",
        content:
          "Необработанные обращения, просроченные действия и подтверждённые ошибки сотрудников.",
      },
      { property: "og:title", content: "Контроль сотрудников — NOVA CRM" },
      {
        property: "og:description",
        content: "Контроль обращений, действий и подтверждённых ошибок руководителем.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlPage,
});
function ControlPage() {
  const { isAdmin, branch, openLead } = useCrm();
  const qc = useQueryClient();
  const query = useQuery({ ...workspaceDataQ, enabled: isAdmin });
  const employees = useQuery({ ...employeesQ, enabled: isAdmin }).data ?? [];
  const errors = useQuery({
    queryKey: ["employee-errors"],
    enabled: isAdmin,
    queryFn: async () => {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const r = await supabase
          .from("employee_errors")
          .select("*")
          .order("id")
          .range(from, from + 999);
        if (r.error) throw r.error;
        out.push(...r.data);
        if (r.data.length < 1000) break;
      }
      return out;
    },
  });
  const [tab, setTab] = useState("unprocessed");
  const [employee, setEmployee] = useState("");
  const [localBranch, setLocalBranch] = useState(branch);
  const [kind, setKind] = useState<PeriodKind | "all">("all");
  const [date, setDate] = useState(bishkekDate());
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorId, setErrorId] = useState("");
  if (!isAdmin) return <p className="text-muted-foreground">Этот раздел доступен руководителю.</p>;
  const range = kind === "all" ? null : periodRange(kind, date);
  const leads = (query.data?.leads ?? []).filter(
    (l) =>
      (localBranch === "all" || l.branch_code === localBranch) &&
      (!employee || l.responsible_email === employee) &&
      (!range || (l.lead_date >= range.from && l.lead_date <= range.to)),
  );
  const unprocessed = leads.filter((l) => !l.outcome && l.stage <= 1);
  const overdue = leads.filter((l) => openTasks(l, bishkekDate()).length > 0);
  const confirmed = (errors.data ?? []).filter((e) => leads.some((l) => l.id === e.lead_id));
  const records =
    tab === "unprocessed"
      ? unprocessed
      : tab === "overdue"
        ? overdue
        : leads.filter((l) => confirmed.some((e) => e.lead_id === l.id));
  const nameOf = (email: string | null) =>
    employees.find((e) => e.email === email)?.full_name || email || "Без ответственного";
  async function confirm() {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    const r = await supabase
      .from("employee_errors")
      .insert({ lead_id: selected, reason: reason.trim() });
    setBusy(false);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success("Ошибка подтверждена");
    setReason("");
    await qc.invalidateQueries({ queryKey: ["employee-errors"] });
  }
  async function resolve() {
    const e = confirmed.find((e) => e.id === errorId);
    const lead = leads.find((l) => l.id === e?.lead_id);
    if (!e || !lead || !resolution.trim()) return;
    if (openTasks(lead, bishkekDate()).length) {
      toast.error("Сначала выполните действия в карточке пациента");
      return;
    }
    setBusy(true);
    const r = await supabase
      .from("employee_errors")
      .update({ resolution: resolution.trim(), resolved_at: new Date().toISOString() })
      .eq("id", e.id);
    setBusy(false);
    if (r.error) toast.error(r.error.message);
    else {
      toast.success("Исправление сохранено");
      setResolution("");
      await qc.invalidateQueries({ queryKey: ["employee-errors"] });
    }
  }
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase text-muted-foreground">Панель руководителя</div>
        <h1 className="mt-2 break-words font-display text-2xl font-bold lg:text-3xl">
          Контроль сотрудников
        </h1>
      </header>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Период контроля"
          className="rounded-md border border-input bg-card p-2"
          value={kind}
          onChange={(e) => setKind(e.target.value as PeriodKind | "all")}
        >
          <option value="all">За всё время</option>
          <option value="day">День</option>
          <option value="month">Месяц</option>
          <option value="year">Год</option>
        </select>
        {kind !== "all" && (
          <Input
            type="date"
            className="w-40"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        )}
        <select
          aria-label="Филиал контроля"
          className="rounded-md border border-input bg-card p-2"
          value={localBranch}
          onChange={(e) => setLocalBranch(e.target.value)}
        >
          <option value="all">Все филиалы</option>
          {BRANCHES.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Сотрудник контроля"
          className="rounded-md border border-input bg-card p-2"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
        >
          <option value="">Все сотрудники</option>
          {[
            ...new Set(leads.flatMap((l) => (l.responsible_email ? [l.responsible_email] : []))),
          ].map((e) => (
            <option key={e} value={e}>
              {nameOf(e)}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={() =>
            exportWorkbook("NOVA_контроль", {
              Записи: records.map((l) => ({
                Пациент: l.patient_name,
                Ответственный: nameOf(l.responsible_email),
                Действия: openTasks(l, bishkekDate()).join("; "),
              })),
              Ошибки: confirmed.map((e) => ({
                Причина: e.reason,
                Подтвердил: e.confirmed_by,
                Дата: e.confirmed_at,
                Исправление: e.resolution,
                Закрыто: e.resolved_at,
              })),
            })
          }
        >
          Excel
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 border-b pb-6 sm:grid-cols-3">
        {[
          ["unprocessed", "Необработанные обращения", unprocessed.length],
          ["overdue", "Невыполненные действия", overdue.length],
          ["errors", "Подтверждённые ошибки", confirmed.length],
        ].map(([key, label, count]) => (
          <Button
            key={key}
            variant={tab === key ? "secondary" : "ghost"}
            className="h-auto flex-col items-start whitespace-normal p-3 text-left"
            onClick={() => setTab(String(key))}
          >
            <span className="font-display text-4xl font-bold text-destructive">{count}</span>
            <span>{label}</span>
          </Button>
        ))}
      </div>
      {(query.isPending || errors.isPending) && <p className="text-muted-foreground">Загрузка…</p>}
      {(query.isError || errors.isError) && (
        <p className="text-destructive">Не удалось загрузить данные</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {["Пациент", "Сотрудник", "Действие / ошибка", ""].map((h, i) => (
                <th className="p-3" key={i}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((l) => (
              <tr className="border-b" key={l.id}>
                <td className="p-3">
                  <Button variant="link" onClick={() => openLead(l.id)}>
                    {l.patient_name || l.phone}
                  </Button>
                </td>
                <td>{nameOf(l.responsible_email)}</td>
                <td className="max-w-72 p-3 text-destructive">
                  {tab === "errors"
                    ? confirmed
                        .filter((e) => e.lead_id === l.id)
                        .map((e) => (
                          <div key={e.id} className="mb-2">
                            {e.reason}
                            <div className="text-xs text-muted-foreground">
                              Подтвердил: {e.confirmed_by} · {e.confirmed_at.slice(0, 10)}
                              {e.resolved_at ? ` · Исправлено: ${e.resolution}` : ""}
                            </div>
                            {!e.resolved_at && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setErrorId(e.id);
                                  setSelected(l.id);
                                }}
                              >
                                Зафиксировать исправление
                              </Button>
                            )}
                          </div>
                        ))
                    : openTasks(l, bishkekDate()).join("; ") || "Обращение не обработано"}
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected(l.id);
                      setErrorId("");
                    }}
                  >
                    Подтвердить ошибку
                  </Button>
                </td>
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-muted-foreground">
                  Нет записей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <section className="space-y-3 border-t pt-4">
          <h2 className="font-semibold">
            {leads.find((l) => l.id === selected)?.patient_name || "Пациент"}
          </h2>
          <Button variant="outline" onClick={() => openLead(selected)}>
            Открыть карточку
          </Button>
          {errorId ? (
            <>
              <Textarea
                aria-label="Исправление ошибки"
                placeholder="Что исправлено"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
              <Button disabled={busy || !resolution.trim()} onClick={resolve}>
                Сохранить исправление
              </Button>
            </>
          ) : (
            <>
              <Textarea
                aria-label="Причина ошибки"
                placeholder="Причина подтверждённой ошибки"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button disabled={busy || !reason.trim()} onClick={confirm}>
                Подтвердить ошибку
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setSelected("")}>
            Отмена
          </Button>
        </section>
      )}
    </div>
  );
}
