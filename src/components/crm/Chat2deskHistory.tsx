import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { messengerDate } from "@/lib/chat2desk";
import { importChat2deskHistory } from "@/lib/chat2desk-backfill.functions";

const phases: Record<string, string> = { anchor: "Поиск начала периода", messages: "Обращения", clients: "Клиенты", finalize: "Подсчёт итогов" };
export function Chat2deskHistory() {
  const [range, setRange] = useState({ from: "2026-01-01", to: messengerDate(new Date().toISOString()) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => () => { active.current = false; }, []);
  const queryClient = useQueryClient();
  const run = useServerFn(importChat2deskHistory);
  const history = useQuery({
    queryKey: ["chat2desk-backfill-job"],
    queryFn: async () => {
      const res = await supabase.from("chat2desk_backfill_jobs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },
  });
  async function load(jobId?: string) {
    if (active.current) return;
    active.current = true; setBusy(true); setError("");
    try {
      let nextId = jobId;
      while (active.current) {
        const job = await run({ data: nextId ? { jobId: nextId } : range });
        queryClient.setQueryData(["chat2desk-backfill-job"], job);
        if (job.status !== "running") break;
        nextId = job.id;
        // Another tab owns a short lease; let the user resume instead of polling the API.
        if ("lease_until" in job && job.lease_until && new Date(String(job.lease_until)).getTime() > Date.now()) break;
      }
      await queryClient.invalidateQueries({ queryKey: ["chat2desk-report"] });
      await queryClient.invalidateQueries({ queryKey: ["chat2desk-status"] });
    } catch (error) { setError(error instanceof Error ? error.message : "Загрузка остановлена. Нажмите «Продолжить»."); await history.refetch(); }
    finally { active.current = false; setBusy(false); }
  }
  const job = history.data;
  const valid = range.from && range.to && range.from <= range.to && range.to <= messengerDate(new Date().toISOString());
  return <div className="space-y-3 border-t pt-4">
    <h3 className="font-semibold">Загрузка истории</h3>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">С<Input type="date" aria-label="История Chat2Desk — с" value={range.from} disabled={busy} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
      <label className="space-y-1 text-sm">По<Input type="date" aria-label="История Chat2Desk — по" value={range.to} disabled={busy} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
      <Button disabled={busy || !valid || history.isPending || history.isError || (!!job && job.status !== "done")} onClick={() => load()}><Download className="size-4" />Загрузить историю</Button>
      {job && job.status !== "done" && <Button variant="outline" disabled={busy} onClick={() => load(job.id)}><Play className="size-4" />Продолжить</Button>}
    </div>
    <p className="text-xs text-muted-foreground">Каждые 200 сообщений = 1 запрос API</p>
    {history.isError && <p className="text-sm text-destructive">Не удалось получить ход загрузки.</p>}
    {job && <div role="status" className="space-y-1 text-sm">
      <p>{job.from_date} — {job.to_date} · {phases[job.phase] ?? job.phase} · {busy ? "Загрузка…" : job.status === "done" ? "Завершено" : job.status === "error" ? "Ошибка" : "Остановлено"}</p>
      <p>Импортировано обращений: {job.requests_imported} · Клиентов: {job.clients_imported} · Потрачено API-запросов: {job.api_calls}</p>
      {job.error && <p className="break-words text-destructive">{job.error}</p>}
    </div>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
  </div>;
}