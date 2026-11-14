import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCrm } from "@/components/crm/context";
import { leadsQ, useDoctors } from "@/components/crm/data";
import {
  FUNNELS,
  LINES,
  branchName,
  fmtDate,
  leadCategory,
  stageLabel,
  toCSV,
  type FunnelCode,
} from "@/lib/crm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useLabels } from "@/components/crm/labels";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Пациенты — Nova CRM" },
      { name: "description", content: "База пациентов с поиском, фильтрами и выгрузкой." },
      { property: "og:title", content: "Пациенты — Nova CRM" },
      { property: "og:description", content: "База пациентов с поиском, фильтрами и выгрузкой." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
});
const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const CATS = ["Первичные", "Прогретые", "Финал", "Потерянные", "Не пришли", "Мусорные"];

function LeadsPage() {
  const labels = useLabels();
  const { branch, openLead, newLead } = useCrm();
  const leads = useQuery(leadsQ(branch)).data ?? [];
  const doctors = useDoctors();
  const [q, setQ] = useState("");
  const [line, setLine] = useState("");
  const [funnel, setFunnel] = useState("");
  const [cat, setCat] = useState("");
  const [resp, setResp] = useState("");
  const docName = (id: string | null) => doctors.find((d) => d.id === id)?.full_name ?? "";
  const rows = useMemo(
    () =>
      leads.filter((l) => {
        const s = q.toLowerCase();
        if (
          s &&
          ![l.patient_name, l.phone, docName(l.doctor_id), l.comment].some((x) =>
            (x ?? "").toLowerCase().includes(s),
          )
        )
          return false;
        if (line && l.line !== line) return false;
        if (funnel && l.funnel !== funnel) return false;
        if (cat && leadCategory(l) !== cat) return false;
        if (resp && !(l.responsible_email ?? "").includes(resp)) return false;
        return true;
      }),
    [leads, q, line, funnel, cat, resp, doctors],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCSV() {
    const csv = toCSV(
      rows.map((l) => ({
        Дата: fmtDate(l.lead_date),
        Пациент: l.patient_name,
        Телефон: l.phone,
        Филиал: branchName(l.branch_code),
        Линия: l.line,
        Источник: l.source,
        Воронка: FUNNELS[l.funnel as FunnelCode]?.name,
        Этап: stageLabel(l.funnel, l.stage),
        Категория: leadCategory(l),
        Врач: docName(l.doctor_id),
        Визит: fmtDate(l.visit_date),
        Ответственный: l.responsible_email,
        Комментарий: l.comment,
      })),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `заявки_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-xl font-bold">
          {labels["leads"]} <span className="text-sm text-muted-foreground">{rows.length}</span>
        </h1>
        <Button onClick={() => newLead()}>Добавить пациента</Button>
        <Input
          className="w-64"
          placeholder="Имя, телефон, врач, комментарий"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={sel} value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">Все линии</option>
          {LINES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select className={sel} value={funnel} onChange={(e) => setFunnel(e.target.value)}>
          <option value="">Все воронки</option>
          {Object.entries(FUNNELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Все категории</option>
          {CATS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <Input
          className="w-44"
          placeholder="Ответственный"
          value={resp}
          onChange={(e) => setResp(e.target.value)}
        />
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCSV}>
          <Download className="size-4" />
          Excel / CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              {[
                "Дата",
                "Пациент",
                "Телефон",
                "Филиал",
                "Линия",
                "Этап",
                "Категория",
                "Врач",
                "Визит",
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr
                key={l.id}
                onClick={() => openLead(l.id)}
                className="cursor-pointer border-t hover:bg-muted/50"
              >
                <td className="px-3 py-2">{fmtDate(l.lead_date)}</td>
                <td className="px-3 py-2 font-medium">{l.patient_name}</td>
                <td className="px-3 py-2">{l.phone}</td>
                <td className="px-3 py-2">{branchName(l.branch_code)}</td>
                <td className="px-3 py-2">{l.line}</td>
                <td className="px-3 py-2">{stageLabel(l.funnel, l.stage)}</td>
                <td className="px-3 py-2">{leadCategory(l)}</td>
                <td className="px-3 py-2">{docName(l.doctor_id)}</td>
                <td className="px-3 py-2">{fmtDate(l.visit_date)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  Пациентов нет. Нажмите «Новая заявка» в меню слева.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
