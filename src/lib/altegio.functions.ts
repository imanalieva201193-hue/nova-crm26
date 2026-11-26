import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALTEGIO_WEBHOOK_URL } from "./altegio";

const actionInput = z.object({ action: z.enum(["check", "discover", "catalogs", "webhook", "history"]), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), jobId: z.string().uuid().optional() });

export const manageAltegio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof actionInput>) => actionInput.parse(value))
  .handler(async ({ data, context }) => {
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    const employee = await context.supabase.from("employees").select("role").ilike("email", email).eq("active", true).maybeSingle();
    if (employee.error || employee.data?.role !== "commercial_director") throw new Error("Настройки Altegio доступны только коммерческому директору.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { altegioApi, AltegioError } = await import("./altegio-api.server");
    const { mappedLocations, runJobChunk } = await import("./altegio-sync.server");
    const api = altegioApi();
    try {
      if (data.action === "check" || data.action === "discover") {
        const locations = await api.locations();
        if (data.action === "discover" && locations.length) {
          const result = await db.from("altegio_locations").upsert(locations.map(l => ({ location_id: l.id, title: l.title })), { onConflict: "location_id" });
          if (result.error) throw new Error("Не удалось сохранить список филиалов.");
        }
        return { message: `Подключение проверено. Доступных филиалов: ${locations.length}.`, job: null };
      }
      const locations = await mappedLocations(db);
      if (!locations.length) throw new Error("Сначала найдите филиалы и выберите их соответствие в CRM.");
      if (data.action === "history") {
        let id = data.jobId;
        if (!id) {
          const date = data.from ? new Date(`${data.from}T00:00:00Z`) : null;
          if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.from) throw new Error("Укажите корректную дату начала загрузки.");
          const created = await db.from("altegio_jobs").insert({ from_date: data.from ?? "", location_ids: locations, started_by: context.userId }).select("id").single();
          if (created.error) throw new Error("Не удалось сохранить задание загрузки.");
          id = created.data.id;
        }
        const job = await runJobChunk(db, id, api);
        if (!job) throw new Error("Задание загрузки не найдено.");
        return { message: job.status === "done" ? "История загружена." : "Загрузка истории", job };
      }
      if (data.action === "webhook") {
        for (const loc of locations) await api.registerHook(loc, ALTEGIO_WEBHOOK_URL);
        return { message: `Вебхук зарегистрирован для ${locations.length} филиалов. Ожидаем первое событие.`, job: null };
      }
      for (const loc of locations) {
        const services = await api.services(loc);
        const categories = await api.categories(loc);
        const users = await api.users(loc);
        for (const result of [
          services.length ? await db.from("altegio_services").upsert(services) : null,
          categories.length ? await db.from("altegio_categories").upsert(categories) : null,
          users.length ? await db.from("altegio_users").upsert(users) : null,
        ]) if (result?.error) throw new Error("Не удалось сохранить справочники Altegio.");
      }
      return { message: "Услуги, категории и сотрудники обновлены.", job: null };
    } catch (error) {
      if (error instanceof AltegioError) throw new Error(error.message);
      if (error instanceof Error && /^(Не удалось|Сначала|Укажите|Задание)/.test(error.message)) throw error;
      throw new Error("Не удалось выполнить действие Altegio. Попробуйте позже.");
    }
  });