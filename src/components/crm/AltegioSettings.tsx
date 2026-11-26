import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle, Download, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ALTEGIO_HISTORY_FROM, ALTEGIO_WEBHOOK_URL, ALTEGIO_KINDS } from "@/lib/altegio";
import { BRANCHES } from "@/lib/crm";
import { manageAltegio } from "@/lib/altegio.functions";
import { altegioDataQ } from "./altegio-data";

export function AltegioSettings({ data }: { data: Awaited<ReturnType<NonNullable<typeof altegioDataQ.queryFn>>> }) {
  const qc = useQueryClient();
  const run = useServerFn(manageAltegio);
  const [from, setFrom] = useState(ALTEGIO_HISTORY_FROM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => () => { active.current = false; }, []);
  async function act(action: "check" | "discover" | "catalogs" | "webhook" | "history", jobId?: string) {
    if (busy) return;
    setBusy(true); setMessage(""); setError(""); active.current = true;
    try {
      let id = jobId;
      do {
        const result = await run({ data: { action, from, ...(id ? { jobId: id } : {}) } });
        setMessage(result.message);
        await qc.invalidateQueries({ queryKey: ["altegio-data"] });
        if (!result.job || result.job.status !== "running" || result.job.lease_until) break;
        id = result.job.id;
      } while (action === "history" && active.current);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось подключить Altegio."); }
    finally { active.current = false; setBusy(false); }
  }
  async function save(table: "altegio_locations" | "altegio_staff" | "altegio_users" | "altegio_categories", key: number, value: string, location?: number) {
    setError(""); setBusy(true);
    try {
      const q = table === "altegio_locations" ? supabase.from(table).update({ branch_code: value || null }).eq("location_id", key)
        : table === "altegio_staff" ? supabase.from(table).update({ doctor_id: value || null, manual: true }).eq("staff_id", key).eq("location_id", location ?? 0)
        : table === "altegio_users" ? supabase.from(table).update({ employee_email: value || null, manual: true }).eq("user_id", key)
        : supabase.from(table).update({ kind: value || null }).eq("category_id", key);
      const result = await q;
      if (result.error) throw new Error("Не удалось сохранить соответствие.");
      await qc.invalidateQueries({ queryKey: ["altegio-data"] });
      setMessage("Соответствие сохранено.");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить."); }
    finally { setBusy(false); }
  }
  const sel = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";
  const job = data.job;
  return <div className="space-y-8">
    <section className="space-y-4 border-b pb-6"><h2 className="font-display text-xl font-bold">Подключение Altegio</h2>
      <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => act("check")}><CheckCircle className="size-4" />Проверить подключение</Button><Button variant="outline" disabled={busy} onClick={() => act("discover")}><RefreshCw className="size-4" />Найти мои филиалы</Button></div>
      <p className="text-sm text-muted-foreground">Последнее событие: {data.events[0] ? new Date(data.events[0].received_at).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) : "ещё не получено"}</p>
      <code className="block max-w-full break-all text-xs">{ALTEGIO_WEBHOOK_URL}</code><Button variant="outline" disabled={busy} onClick={() => act("webhook")}><Link2 className="size-4" />Зарегистрировать вебхук</Button>
      {message && <p role="status" className="text-sm text-primary">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
    <section className="space-y-4 border-b pb-6"><h2 className="font-display text-xl font-bold">Филиалы</h2>{!data.locations.length && <p className="text-sm text-muted-foreground">Филиалы пока не найдены.</p>}{data.locations.map(l => <div key={l.location_id} className="grid items-center gap-3 md:grid-cols-2"><span className="text-sm">{l.title} · #{l.location_id}</span><select aria-label={`Филиал CRM для ${l.location_id}`} disabled={busy} className={sel} value={l.branch_code ?? ""} onChange={e => save("altegio_locations", l.location_id, e.target.value)}><option value="">Не привязан</option>{BRANCHES.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}</select></div>)}</section>
    <section className="space-y-4 border-b pb-6"><h2 className="font-display text-xl font-bold">Загрузка истории</h2><div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm">С даты<Input type="date" value={from} disabled={busy} onChange={e => setFrom(e.target.value)} /></label><Button disabled={busy || !data.locations.some(l => l.branch_code)} onClick={() => act("history")}><Download className="size-4" />{busy ? "Загрузка…" : "Загрузить историю"}</Button>{job && job.status !== "done" && <Button variant="outline" disabled={busy} onClick={() => act("history", job.id)}>Продолжить</Button>}{busy && <Button variant="outline" onClick={() => { active.current = false; }}>Остановить после порции</Button>}</div>{job && <div className="space-y-2 text-sm"><p>{job.status === "done" ? "Завершено" : job.status === "error" ? "Остановлено" : "В процессе"} · Филиал {Math.min(job.loc_index + 1, job.location_ids.length)} из {job.location_ids.length} · Страница {job.page}</p><p>Записей обработано: {job.imported} · API-запросов: {job.api_calls}</p>{job.error && <p className="text-destructive">{job.error}</p>}</div>}</section>
    <section className="space-y-4 border-b pb-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Категории услуг</h2><Button variant="outline" disabled={busy} onClick={() => act("catalogs")}><RefreshCw className="size-4" />Обновить справочники</Button></div>{!data.categories.length && <p className="text-sm text-muted-foreground">Категории пока не загружены.</p>}{data.categories.map(c => <div key={c.category_id} className="grid items-center gap-3 md:grid-cols-2"><span className="text-sm">{c.title} · #{c.category_id}</span><select aria-label={`Категория ${c.category_id}`} className={sel} disabled={busy} value={c.kind ?? ""} onChange={e => save("altegio_categories", c.category_id, e.target.value)}><option value="">По направлению филиала</option>{Object.entries(ALTEGIO_KINDS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div>)}</section>
    <section className="space-y-4 border-b pb-6"><h2 className="font-display text-xl font-bold">Врачи</h2>{!data.staff.length && <p className="text-sm text-muted-foreground">Врачи появятся после загрузки записей.</p>}{data.staff.map(s => <div key={`${s.location_id}:${s.staff_id}`} className="grid items-center gap-3 md:grid-cols-2"><span className="text-sm">{s.name} · #{s.staff_id}</span><select aria-label={`Врач ${s.staff_id}`} className={sel} disabled={busy} value={s.doctor_id ?? ""} onChange={e => save("altegio_staff", s.staff_id, e.target.value, s.location_id)}><option value="">Не сопоставлен</option>{data.doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>)}</section>
    <section className="space-y-4"><h2 className="font-display text-xl font-bold">Кто создал запись</h2>{!data.users.length && <p className="text-sm text-muted-foreground">Сотрудники пока не загружены.</p>}{data.users.map(u => <div key={u.user_id} className="grid items-center gap-3 md:grid-cols-2"><span className="text-sm">{u.name} · #{u.user_id}</span><select aria-label={`Сотрудник ${u.user_id}`} className={sel} disabled={busy} value={u.employee_email ?? ""} onChange={e => save("altegio_users", u.user_id, e.target.value)}><option value="">Не сопоставлен</option>{data.employees.map(e => <option key={e.email} value={e.email}>{e.full_name || e.email}</option>)}</select></div>)}</section>
  </div>;
}