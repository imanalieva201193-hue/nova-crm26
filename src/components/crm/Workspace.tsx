import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCrm } from "./context";
import { employeesQ, partnersQ, workspaceDataQ, type Lead } from "./data";
import {
  WORKSPACES,
  inWorkspace,
  workspaceMetrics,
  bishkekDate,
  periodRange,
  stageLabel,
  branchName,
  fmtMoney,
  openTasks,
  type WorkspaceKey,
  type PeriodKind,
  type WorkspaceMetric,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Plus, ArrowUpRight } from "lucide-react";
import { exportWorkbook } from "./workspace-export";
import { PartnerBase } from "./WorkspacePartners";

const selectClass = "h-10 max-w-full rounded-md border border-input bg-card px-3 text-sm";
export function Workspace({ area }: { area: WorkspaceKey }) {
  const { branch, newLead, openLead } = useCrm();
  const config = WORKSPACES[area];
  const query = useQuery(workspaceDataQ);
  const employees = useQuery(employeesQ).data ?? [];
  const partners = useQuery(partnersQ).data ?? [];
  const [tab, setTab] = useState<"base" | "report">("base");
  const [segment, setSegment] = useState(area === "abd2" ? "checkup" : "");
  const [search, setSearch] = useState("");
  const [employee, setEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("");
  const [source, setSource] = useState("");
  const [period, setPeriod] = useState<PeriodKind | "all">("all");
  const [date, setDate] = useState(bishkekDate());
  const [drill, setDrill] = useState<WorkspaceMetric | null>(null);
  const [group, setGroup] = useState<"numerator" | "denominator">("numerator");
  const [entity, setEntity] = useState("patients");
  const [localBranch, setLocalBranch] = useState(config.branch || branch);
  const range = period === "all" ? null : periodRange(period, date);
  const leads = query.data?.leads ?? [];
  const nameOf = (email: string | null) =>
    employees.find((e) => e.email === email)?.full_name || email || "Без ответственного";
  const scoped = useMemo(
    () => leads.filter((l) => inWorkspace(l, area, segment)),
    [leads, area, segment],
  );
  const filtered = scoped.filter(
    (l) =>
      (!range || (l.lead_date >= range.from && l.lead_date <= range.to)) &&
      (localBranch === "all" || l.branch_code === localBranch) &&
      (!employee ||
        (employee === "__none" ? !l.responsible_email : l.responsible_email === employee)) &&
      (!status || status === l.outcome || status === String(l.stage)) &&
      (!source || l.source === source) &&
      (!direction || l.clinical_direction === direction) &&
      (!search ||
        [l.patient_name, l.phone, l.comment, l.campaign].some((v) =>
          v?.toLowerCase().includes(search.toLowerCase()),
        )),
  );
  const metrics = workspaceMetrics(
    filtered,
    query.data?.revenue ?? {},
    bishkekDate(),
    area === "agents" ? partners : [],
  );
  const currentMetric = drill ? metrics.find((m) => m.key === drill.key) : null;
  const ids = group === "denominator" ? currentMetric?.denominatorIds : currentMetric?.ids;
  const rows = ids ? filtered.filter((l) => ids.includes(l.id)) : filtered;
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 30) - 1));
  const tableRows = (ls: Lead[]) =>
    ls.map((l) => ({
      Пациент: l.patient_name,
      Телефон: l.phone,
      "ID пациента": l.patient_id,
      "ID обращения": l.id,
      Дата: l.lead_date,
      Филиал: branchName(l.branch_code),
      Источник: l.source,
      Направление: l.clinical_direction,
      Кампания: l.campaign,
      Статус: l.outcome || stageLabel(l.funnel, l.stage),
      Ответственный: nameOf(l.responsible_email),
      "Следующее касание": l.next_touch,
      "Выручка, сом": query.data?.revenue[l.id] || 0,
    }));
  function download() {
    exportWorkbook(`NOVA_${area}_${date}`, {
      Итоги: metrics.map((m) => ({ Показатель: m.label, Значение: m.value })),
      Фильтры: [
        {
          Раздел: config.title,
          Направление: segment,
          Период: period,
          От: range?.from || "",
          До: range?.to || "",
          Филиал: localBranch,
          Сотрудник: employee,
          Статус: status,
          Источник: source,
        },
      ],
      Записи: tableRows(rows),
    });
  }
  function add() {
    const chosenBranch = config.branch || (localBranch !== "all" ? localBranch : undefined);
    newLead({
      branch_code: chosenBranch,
      funnel:
        area === "abd2"
          ? segment === "general"
            ? "nova_general"
            : "nova_check"
          : config.funnel || undefined,
      work_area: config.branch ? undefined : area,
      line:
        area === "agents" ? "Агентская программа" : area === "callcenter" ? "Колл-центр" : "Филиал",
      source: area === "target" ? "Таргет" : undefined,
      business_segment: area === "business" && segment ? segment : undefined,
    });
  }
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Рабочее направление
        </div>
        <h1 className="mt-2 break-words font-display text-2xl font-bold lg:text-3xl">
          {config.title}
        </h1>
      </header>
      <div className="flex w-fit rounded-md bg-muted p-1" role="tablist" aria-label="База и отчёт">
        {(["base", "report"] as const).map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant={tab === t ? "secondary" : "ghost"}
            className="min-w-28"
            onClick={() => {
              setTab(t);
              setDrill(null);
            }}
          >
            {t === "base" ? "БАЗА" : "ОТЧЁТ"}
          </Button>
        ))}
      </div>
      {(area === "abd2" || area === "business" || area === "callcenter") && (
        <div className="flex flex-wrap gap-2">
          {(area === "abd2"
            ? [
                ["checkup", "Чекап"],
                ["general", "Общий профиль"],
              ]
            : area === "business"
              ? [
                  ["", "Все"],
                  ["B2B", "B2B"],
                  ["B2C", "B2C"],
                ]
              : [
                  ["", "Все каналы"],
                  ["3CX", "3CX"],
                  ["Chat2Desk", "Chat2Desk"],
                ]
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={segment === value ? "default" : "outline"}
              onClick={() => {
                setSegment(value || "");
                setDrill(null);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {tab === "base" && (area === "agents" || (area === "business" && segment === "B2B")) && (
        <div className="flex gap-2">
          <Button
            variant={entity === "patients" ? "default" : "outline"}
            onClick={() => setEntity("patients")}
          >
            Пациенты и обращения
          </Button>
          <Button
            variant={entity === "partners" ? "default" : "outline"}
            onClick={() => setEntity("partners")}
          >
            Партнёры
          </Button>
        </div>
      )}
      {tab === "base" && entity === "partners" && (area === "agents" || area === "business") ? (
        <PartnerBase segment={area === "business" ? "B2B" : "agents"} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Поиск записей"
              placeholder="Имя, телефон, комментарий"
              className="w-full sm:w-64"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Период"
              className={selectClass}
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKind | "all")}
            >
              <option value="all">За всё время</option>
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="year">Год</option>
            </select>
            {period !== "all" && (
              <Input
                aria-label="Дата периода"
                type="date"
                className="w-40"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            )}
            <select
              aria-label="Филиал"
              className={selectClass}
              value={localBranch}
              onChange={(e) => setLocalBranch(e.target.value)}
            >
              <option value="all">Все филиалы</option>
              {Object.entries(WORKSPACES)
                .filter(([, w]) => w.branch)
                .map(([key, w]) => (
                  <option key={key} value={w.branch}>
                    {w.title}
                  </option>
                ))}
            </select>
            <select
              aria-label="Ответственный"
              className={selectClass}
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">Все сотрудники</option>
              <option value="__none">Без ответственного</option>
              {[
                ...new Set([
                  ...employees.map((e) => e.email),
                  ...scoped.flatMap((l) => (l.responsible_email ? [l.responsible_email] : [])),
                ]),
              ].map((email) => (
                <option key={email} value={email}>
                  {nameOf(email)}
                </option>
              ))}
            </select>
            <select
              aria-label="Статус"
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Все статусы</option>
              {[...new Set(scoped.map((l) => l.outcome || String(l.stage)))].map((s) => (
                <option key={s} value={s}>
                  {scoped.find((l) => (l.outcome || String(l.stage)) === s)?.outcome ||
                    stageLabel(config.funnel || "nova_general", Number(s))}
                </option>
              ))}
            </select>
            <select
              aria-label="Источник"
              className={selectClass}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Все источники</option>
              {[...new Set(scoped.map((l) => l.source))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {area === "abd3" && (
              <select
                aria-label="Направление хирургии"
                className={selectClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="">Все направления</option>
                <option>Общая хирургия</option>
                <option>Пластическая хирургия</option>
              </select>
            )}
            <Button variant="outline" onClick={download} disabled={!query.data}>
              <Download className="size-4" />
              Excel
            </Button>
            {tab === "base" && (
              <Button onClick={add}>
                <Plus className="size-4" />
                Добавить запись
              </Button>
            )}
          </div>
          {query.isPending ? (
            <p className="text-muted-foreground">Загрузка…</p>
          ) : query.isError ? (
            <p className="text-destructive">
              Не удалось загрузить записи.{" "}
              <Button variant="outline" onClick={() => query.refetch()}>
                Повторить
              </Button>
            </p>
          ) : tab === "report" ? (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b py-4 md:grid-cols-3 xl:grid-cols-4">
                {metrics
                  .filter((m) =>
                    area === "callcenter"
                      ? ["all", "patients", "unprocessed", "booked", "came", "conversion"].includes(
                          m.key,
                        )
                      : area === "abd2" && segment === "checkup"
                        ? m.key !== "operations"
                        : true,
                  )
                  .map((m) => (
                    <Button
                      key={m.key}
                      variant="ghost"
                      className="h-auto min-w-0 flex-col items-start whitespace-normal p-3 text-left"
                      onClick={() => {
                        setDrill(m);
                        setGroup("numerator");
                        setTab("base");
                        setPage(0);
                      }}
                    >
                      <span className="flex max-w-full items-center gap-2 break-all font-display text-3xl font-bold">
                        {m.money ? fmtMoney(m.value) : `${m.value}${m.percent ? "%" : ""}`}
                        <ArrowUpRight className="size-4 shrink-0 text-primary" />
                      </span>
                      <span className="mt-1 text-sm text-muted-foreground">{m.label}</span>
                    </Button>
                  ))}
              </div>
              <section className="space-y-3">
                <h2 className="font-display text-xl font-bold">По сотрудникам</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-3">Сотрудник</th>
                        {["Обращения", "Записи", "Пришли", "Завершено"].map((s) => (
                          <th className="p-3" key={s}>
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(filtered.map((l) => l.responsible_email))].map((email) => {
                        const ms = workspaceMetrics(
                          filtered.filter((l) => l.responsible_email === email),
                          query.data.revenue,
                          bishkekDate(),
                        );
                        return (
                          <tr key={email || "none"} className="border-b">
                            <td className="p-3">{nameOf(email)}</td>
                            {["all", "booked", "came", "done"].map((k) => {
                              const m = ms.find((x) => x.key === k);
                              return (
                                <td className="p-3" key={k}>
                                  <Button
                                    variant="ghost"
                                    onClick={() => {
                                      setEmployee(email || "__none");
                                      if (m) {
                                        setDrill(m);
                                        setTab("base");
                                      }
                                    }}
                                  >
                                    {m?.value || 0}
                                  </Button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              {currentMetric && (
                <div className="flex flex-wrap items-center gap-3 border-b pb-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDrill(null);
                      setTab("report");
                    }}
                  >
                    <ArrowLeft className="size-4" />В отчёт
                  </Button>
                  <h2 className="font-semibold">
                    {currentMetric.label} · {rows.length} записей
                  </h2>
                  {currentMetric.denominatorIds && (
                    <>
                      <Button
                        variant={group === "numerator" ? "default" : "outline"}
                        onClick={() => setGroup("numerator")}
                      >
                        Записались · {currentMetric.ids.length}
                      </Button>
                      <Button
                        variant={group === "denominator" ? "default" : "outline"}
                        onClick={() => setGroup("denominator")}
                      >
                        Все обращения · {currentMetric.denominatorIds.length}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => setDrill(null)}>
                    Сбросить показатель
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      {[
                        "Пациент",
                        "Дата обращения",
                        "Филиал / направление",
                        "Источник",
                        "Статус",
                        "Ответственный",
                        "Следующее действие",
                        "",
                      ].map((s, i) => (
                        <th key={i} className="px-3 py-3 font-medium">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(safePage * 30, safePage * 30 + 30).map((l) => (
                      <tr className="border-t" key={l.id}>
                        <td className="px-3 py-3">
                          <Button
                            variant="link"
                            className="h-auto p-0 text-left"
                            onClick={() => openLead(l.id)}
                          >
                            {l.patient_name || l.phone}
                          </Button>
                          <div className="text-xs text-muted-foreground">{l.phone}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{l.lead_date}</td>
                        <td className="px-3 py-3">
                          {l.clinical_direction || branchName(l.branch_code)}
                        </td>
                        <td className="px-3 py-3">
                          {l.source}
                          {l.campaign && (
                            <div className="text-xs text-muted-foreground">{l.campaign}</div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            variant="ghost"
                            className="h-auto whitespace-normal text-left"
                            onClick={() => openLead(l.id)}
                          >
                            {l.outcome || stageLabel(l.funnel, l.stage)}
                          </Button>
                        </td>
                        <td className="px-3 py-3">{nameOf(l.responsible_email)}</td>
                        <td className="w-60 px-3 py-3">
                          <span
                            className={
                              openTasks(l, bishkekDate()).length
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {openTasks(l, bishkekDate()).join("; ") || l.next_touch || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              newLead({
                                phone: l.phone,
                                patient_name: l.patient_name,
                                branch_code: config.branch || l.branch_code,
                                funnel:
                                  area === "abd2"
                                    ? segment === "general"
                                      ? "nova_general"
                                      : "nova_check"
                                    : config.funnel || l.funnel,
                                linkedEncounter: true,
                                work_area: config.branch ? undefined : area,
                                line: l.line,
                                source: l.source,
                                business_segment:
                                  segment === "B2B" || segment === "B2C" ? segment : undefined,
                              })
                            }
                          >
                            Обращение
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-muted-foreground">
                          Нет записей
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Записей: {rows.length}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Назад
                  </Button>
                  <span className="p-2">{safePage + 1}</span>
                  <Button
                    variant="outline"
                    disabled={(safePage + 1) * 30 >= rows.length}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Далее
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
