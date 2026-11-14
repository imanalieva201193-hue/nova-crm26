import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { messengerDate } from "./chat2desk";

const input = z.object({ jobId: z.string().uuid().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export const importChat2deskHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof input>) => input.parse(value))
  .handler(async ({ context, data }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Загрузка доступна только активному руководителю.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { runBackfillChunk } = await import("./chat2desk-backfill.server");
    let jobId = data.jobId;
    if (!jobId) {
      if (!data.from || !data.to || data.from > data.to || data.to > messengerDate(new Date().toISOString()) ||
          [data.from, data.to].some(date => { const d = new Date(`${date}T00:00:00Z`); return !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date; })) {
        throw new Error("Укажите корректный период не позднее сегодняшнего дня.");
      }
      const created = await db.from("chat2desk_backfill_jobs").insert({ from_date: data.from, to_date: data.to, started_by: context.userId }).select("id").single();
      if (created.error) throw new Error("Не удалось сохранить загрузку истории.");
      jobId = created.data.id;
    }
    const lease = crypto.randomUUID();
    const claimed = await db.rpc("claim_chat2desk_backfill", { _id: jobId, _lease: lease });
    if (claimed.error) throw new Error("Не удалось продолжить загрузку истории.");
    if (!claimed.data) {
      const current = await db.from("chat2desk_backfill_jobs").select("*").eq("id", jobId).single();
      if (current.error) throw new Error("Загрузка не найдена.");
      return current.data;
    }
    type Job = import("./chat2desk-backfill.server").BackfillJob;
    let current = claimed.data as unknown as Job;
    try {
      current = await runBackfillChunk(current, {
        save: async job => {
          const res = await db.from("chat2desk_backfill_jobs").update({ api_calls: job.api_calls, updated_at: new Date().toISOString() }).eq("id", job.id).eq("lease_token", lease);
          if (res.error) throw new Error("Не удалось сохранить ход загрузки.");
          current = { ...job };
        },
        page: async (job, events, clients) => {
          const res = await db.rpc("apply_chat2desk_backfill_page", { _id: job.id, _lease: lease, _events: events, _clients: clients, _cursor: job.cursor_start_id ?? 0, _offset: job.clients_offset, _phase: job.phase, _host: job.api_host ?? "" });
          if (res.error) throw new Error("Не удалось сохранить страницу истории.");
          current = res.data as unknown as Job;
          return current;
        },
        finish: async job => {
          const res = await db.rpc("finish_chat2desk_backfill", { _id: job.id, _lease: lease });
          if (res.error) { console.error("Chat2Desk backfill finalize database error", res.error.code, res.error.message); throw new Error("Не удалось завершить подсчёт истории."); }
          return res.data as unknown as Job;
        },
      }, process.env["CHAT2DESK_API_TOKEN"], process.env["CHAT2DESK_API_HOST"]);
    } catch (error) {
      const message = error instanceof Error && /^(Chat2Desk |Не удалось |Добавьте |Достигнут )/.test(error.message) ? error.message : "Не удалось обработать историю. Продолжите позже.";
      const failed = await db.from("chat2desk_backfill_jobs").update({ status: "error", error: message, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("lease_token", lease).select("*").single();
      if (failed.error) throw new Error("Не удалось сохранить остановку загрузки.");
      return failed.data;
    }
    if (current.status !== "done") {
      const released = await db.from("chat2desk_backfill_jobs").update({ lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("lease_token", lease);
      if (released.error) throw new Error("Продолжите загрузку через полторы минуты.");
    }
    return { ...current, lease_token: null, lease_until: null };
  });