import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chat2deskHistoryQ } from "@/components/crm/chat2desk-history-data";
import { clientHistory } from "@/lib/chat2desk-history";
import { messengerMonth } from "@/lib/chat2desk";
import { exportWorkbook } from "@/components/crm/workspace-export";

export const Route = createFileRoute("/_authenticated/chat2desk")({
  loader: ({ context }) => context.queryClient.ensureQueryData(chat2deskHistoryQ),
  head: () => ({ meta: [
    { title: "История клиентов Chat2Desk — Nova CRM" },
    { name: "description", content: "Клиенты из мессенджеров и история обращений по датам и каналам в Nova CRM." },
    { property: "og:title", content: "История клиентов Chat2Desk — Nova CRM" },
    { property: "og:description", content: "Клиенты из мессенджеров и история обращений по датам и каналам в Nova CRM." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: HistoryPage,
});

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", dateStyle: "short", timeStyle: "short" }) : "—";
function HistoryPage() {
  const query = useSuspenseQuery(chat2deskHistoryQ);
  const [range, setRange] = useState(() => messengerMonth());
  const [search, setSearch] = useState("");
  const [transport, setTransport] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const valid = range.from && range.to && range.from <= range.to;
  const rows = useMemo(() => valid ? clientHistory(query.data.events, query.data.clients, { ...range, search, transport: transport === "all" ? "" : transport }) : [], [query.data, range, search, transport, valid]);
  const channels = [...new Set(query.data.events.flatMap(e => e.transport ? [e.transport] : []))].sort();
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  function download() {
    exportWorkbook(`Клиенты_Chat2Desk_${range.from}_${range.to}`, {
      "Клиенты": rows.map(r => ({ "ID клиента": r.id, Имя: r.client?.name ?? "", Телефон: r.client?.phone ?? "", Мессенджер: r.client?.messenger_id ?? "", Каналы: r.channels.join(", "), Обращений: r.history.length, Тип: r.fresh ? "Новый" : "Повторный", "Последнее обращение": date(r.last) })),
      "История обращений": rows.flatMap(r => r.history.map(e => ({ "ID клиента": r.id, "ID обращения": e.request_id, Дата: date(e.event_time), Канал: e.transport, "ID канала": e.channel_id, Тип: e.is_new_client ? "Новый" : "Повторный" }))),
    });
  }
  return <div className="space-y-6">
    <div><div className="text-xs font-semibold uppercase text-muted-foreground">Мессенджеры</div><h1 className="mt-2 font-display text-3xl font-bold">История клиентов Chat2Desk</h1></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 space-y-1 text-sm">Поиск<Input aria-label="Поиск клиентов Chat2Desk" placeholder="Имя, телефон, ID клиента" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="w-full sm:w-64" /></label>
      <label className="space-y-1 text-sm">С<Input aria-label="История клиентов — с" type="date" value={range.from} onChange={e => { setRange({ ...range, from: e.target.value }); setPage(0); }} /></label>
      <label className="space-y-1 text-sm">По<Input aria-label="История клиентов — по" type="date" value={range.to} onChange={e => { setRange({ ...range, to: e.target.value }); setPage(0); }} /></label>
      <Select value={transport} onValueChange={value => { setTransport(value); setPage(0); }}><SelectTrigger aria-label="Канал Chat2Desk" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все каналы</SelectItem>{channels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      <Button variant="outline" size="icon" aria-label="Обновить клиентов Chat2Desk" title="Обновить" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>
      <Button variant="outline" disabled={!rows.length} onClick={download}><Download className="size-4" />Excel</Button>
    </div>
    {!valid && <p className="text-sm text-destructive">Укажите корректный период.</p>}
    {query.isRefetchError && <p className="text-sm text-destructive">Не удалось обновить данные.</p>}
    <div className="flex flex-wrap gap-6 border-y py-4 text-sm"><span>Клиентов: <strong>{rows.length}</strong></span><span>Обращений: <strong>{rows.reduce((sum, r) => sum + r.history.length, 0)}</strong></span><span>Новых: <strong>{rows.filter(r => r.fresh).length}</strong></span><span>Повторных: <strong>{rows.filter(r => !r.fresh).length}</strong></span></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr>{["Клиент", "Телефон / мессенджер", "Канал", "Обращений", "Последнее обращение", "Тип"].map(c => <th key={c} className="px-3 py-3 font-medium">{c}</th>)}</tr></thead><tbody>
      {rows.slice(currentPage * 50, (currentPage + 1) * 50).map(r => <Fragment key={r.id}>
        <tr className="border-t"><td className="px-3 py-3"><Button variant="ghost" className="h-auto max-w-64 justify-start whitespace-normal px-0 text-left" aria-label={`История клиента ${r.id}`} aria-expanded={expanded === r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{expanded === r.id ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}<span className="break-words">{r.client?.name || `Клиент ${r.id}`}<span className="block text-xs font-normal text-muted-foreground">ID {r.id}</span></span></Button></td><td className="px-3 py-3"><div>{r.client?.phone || "—"}</div><div className="text-xs text-muted-foreground">{r.client?.messenger_id || "—"}</div></td><td className="px-3 py-3">{r.channels.join(", ")}</td><td className="px-3 py-3 font-semibold">{r.history.length}</td><td className="whitespace-nowrap px-3 py-3">{date(r.last)}</td><td className="px-3 py-3">{r.fresh ? "Новый" : "Повторный"}</td></tr>
        {expanded === r.id && <tr className="border-t bg-muted/40"><td colSpan={6} className="px-4 py-4"><h2 className="mb-3 font-semibold">История обращений · ID {r.id}</h2><div className="space-y-2">{r.history.map(e => <div key={e.id} className="flex flex-wrap gap-x-6 gap-y-1 border-b py-2"><span>{date(e.event_time)}</span><span>Обращение №{e.request_id ?? "—"}</span><span>{e.transport || "Канал не указан"}</span><span className="text-muted-foreground">{e.is_new_client ? "Первичное" : "Повторное"}</span></div>)}</div></td></tr>}
      </Fragment>)}
      {!rows.length && <tr><td colSpan={6} className="border-t py-12 text-center text-muted-foreground">За выбранный период клиентов нет.</td></tr>}
    </tbody></table></div>
    <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Время Бишкека · {currentPage + 1} / {pages}</span><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</Button><Button variant="outline" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Далее</Button></div></div>
  </div>;
}