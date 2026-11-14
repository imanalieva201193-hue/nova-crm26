import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { messengerBounds, messengerMonth, messengerReport, type MessengerEvent } from "@/lib/chat2desk";
import { exportWorkbook } from "@/components/crm/workspace-export";

const columns = ["Обращений", "Уникальных клиентов", "Новых клиентов", "Повторных клиентов"];
const values = (r: ReturnType<typeof messengerReport>["total"]) => [r.requests, r.unique, r.fresh, r.repeat];
const excelRow = (r: ReturnType<typeof messengerReport>["total"]) => Object.fromEntries(columns.map((c, i) => [c, values(r)[i]]));

export function Chat2deskReport() {
  const [range, setRange] = useState(() => messengerMonth());
  const valid = !!range.from && !!range.to && range.from <= range.to;
  const report = useQuery({
    queryKey: ["chat2desk-report", range], enabled: valid,
    queryFn: async () => {
      const { start, end } = messengerBounds(range.from, range.to);
      const events: MessengerEvent[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("chat2desk_events")
          .select("client_id,hook_type,transport,is_new_client,signature_valid,event_time")
          .eq("signature_valid", true).eq("hook_type", "new_request")
          .gte("event_time", start).lt("event_time", end).order("event_time").order("id").range(offset, offset + 999);
        if (error) throw error;
        events.push(...(data ?? []));
        if (!data || data.length < 1000) return messengerReport(events);
      }
    },
  });
  function download() {
    if (!report.data) return;
    exportWorkbook(`Chat2Desk_${range.from}_${range.to}`, {
      "Итоги": [excelRow(report.data.total)],
      "По каналам": report.data.channels.map(r => ({ Канал: r.label, ...excelRow(r) })),
      "По дням": report.data.days.map(r => ({ Дата: r.label, ...excelRow(r) })),
      "Период": [{ С: range.from, По: range.to, "Часовой пояс": "Asia/Bishkek" }],
    });
  }
  return <section className="space-y-4 border-t pt-6">
    <h2 className="font-display text-xl font-bold">Клиенты из мессенджеров (Chat2Desk)</h2>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">С<Input aria-label="Chat2Desk — начало периода" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
      <label className="space-y-1 text-sm">По<Input aria-label="Chat2Desk — конец периода" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
      <span className="py-2 text-xs text-muted-foreground">Время Бишкека</span>
      <Button variant="outline" disabled={!valid || !report.data} onClick={download}><Download className="size-4" />Excel Chat2Desk</Button>
    </div>
    {!valid ? <p className="text-destructive">Укажите корректный период.</p> : report.isPending ? <p>Загрузка…</p> : report.isError ? <p className="text-destructive">Не удалось загрузить отчёт.</p> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{columns.map((c, i) => <div key={c} className="rounded-lg border bg-card p-4"><div className="text-xs text-muted-foreground">{c}</div><div className="font-display text-2xl font-bold">{values(report.data.total)[i]}</div></div>)}</div>
      <MessengerTable title="По каналам" first="Канал" rows={report.data.channels} />
      <MessengerTable title="По дням" first="Дата" rows={report.data.days} />
    </>}
  </section>;
}

function MessengerTable({ title, first, rows }: { title: string; first: string; rows: ReturnType<typeof messengerReport>["channels"] }) {
  return <div><h3 className="mb-2 font-semibold">{title}</h3><div className="overflow-x-auto"><table className="w-full text-sm">
    <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-left">{first}</th>{columns.map(c => <th className="p-2 text-right" key={c}>{c}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.label} className="border-t"><td className="p-2">{r.label}</td>{values(r).map((v, i) => <td className="p-2 text-right" key={i}>{v}</td>)}</tr>)}
    {!rows.length && <tr><td className="p-3 text-muted-foreground" colSpan={5}>За выбранный период обращений нет.</td></tr>}</tbody>
  </table></div></div>;
}