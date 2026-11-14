import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RefreshCw, Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { registerChat2deskWebhook } from "@/lib/chat2desk.functions";
import { CHAT2DESK_WEBHOOK_URL, messengerBounds, messengerDate } from "@/lib/chat2desk";
import { Chat2deskHistory } from "./Chat2deskHistory";

export function Chat2deskIntegration() {
  const register = useServerFn(registerChat2deskWebhook);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const status = useQuery({
    queryKey: ["chat2desk-status"], refetchInterval: 60000,
    queryFn: async () => {
      const today = messengerDate(new Date().toISOString());
      const { start, end } = messengerBounds(today, today);
      const [last, total, invalid] = await Promise.all([
        supabase.from("chat2desk_events").select("received_at").order("received_at", { ascending: false }).limit(1),
        supabase.from("chat2desk_events").select("id", { count: "exact", head: true }).gte("received_at", start).lt("received_at", end),
        supabase.from("chat2desk_events").select("id", { count: "exact", head: true }).eq("signature_valid", false),
      ]);
      for (const res of [last, total, invalid]) if (res.error) throw res.error;
      return { last: last.data?.[0]?.received_at, total: total.count ?? 0, invalid: invalid.count ?? 0 };
    },
  });
  async function connect() {
    setBusy(true);
    try { const res = await register(); setResult(res.message); }
    catch { setResult("Не удалось подключить Chat2Desk. Проверьте доступ руководителя."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="font-display text-xl font-bold">Интеграция Chat2Desk</h2>
    <div className="flex items-center gap-2">
      <a href={CHAT2DESK_WEBHOOK_URL} className="min-w-0 break-all text-sm text-primary">{CHAT2DESK_WEBHOOK_URL}</a>
      <Button size="icon" variant="outline" aria-label="Скопировать адрес вебхука" title="Скопировать адрес вебхука" onClick={async () => {
        try { await navigator.clipboard.writeText(CHAT2DESK_WEBHOOK_URL); toast.success("Адрес скопирован"); }
        catch { toast.error("Не удалось скопировать адрес"); }
      }}><Copy className="size-4" /></Button>
    </div>
    {status.isPending ? <p>Загрузка…</p> : status.isError ? <p className="text-destructive">Не удалось загрузить состояние подключения.</p> : <dl className="grid gap-3 text-sm md:grid-cols-3">
      <div><dt className="text-muted-foreground">Последнее событие · Бишкек</dt><dd>{status.data.last ? new Date(status.data.last).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) : "Событий пока нет"}</dd></div>
      <div><dt className="text-muted-foreground">Событий сегодня</dt><dd>{status.data.total}</dd></div>
      <div><dt className="text-muted-foreground">Неверных подписей · за всё время</dt><dd className={status.data.invalid ? "text-destructive" : ""}>{status.data.invalid}</dd></div>
    </dl>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={connect}><Plug className="size-4" />{busy ? "Подключение…" : "Подключить вебхук в Chat2Desk"}</Button>
      <Button variant="outline" size="icon" title="Обновить состояние" aria-label="Обновить состояние" onClick={() => status.refetch()}><RefreshCw className="size-4" /></Button>
    </div>
    {result && <p role="status" className="text-sm">{result}</p>}
    <Chat2deskHistory />
  </section>;
}