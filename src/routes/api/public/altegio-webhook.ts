import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payload = z.object({ company_id: z.coerce.number().int().positive(), resource: z.string().max(50), resource_id: z.coerce.number().int().nonnegative(), status: z.string().max(50).optional() }).passthrough();
const ok = () => Response.json({ ok: true });

// Payload content is never trusted: the record is re-read from the Altegio API for known locations only.
export const Route = createFileRoute("/api/public/altegio-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        if (text.length > 512000) return ok();
        let body: z.infer<typeof payload>;
        try { body = payload.parse(JSON.parse(text)); } catch { return ok(); }
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const known = await db.from("altegio_locations").select("location_id").eq("location_id", body.company_id).maybeSingle();
        if (!known.data) return ok();
        const hookId = request.headers.get("x-hook-id")?.slice(0, 200) || null;
        const ev = await db.from("altegio_events").insert({ hook_id: hookId, location_id: body.company_id, resource: body.resource, status: body.status ?? null, resource_id: body.resource_id }).select("id").single();
        if (ev.error) return ok(); // duplicate X-Hook-Id
        let result = "skipped", error: string | null = null;
        try {
          if (body.resource === "record") {
            const { altegioApi } = await import("@/lib/altegio-api.server");
            const { applyRows } = await import("@/lib/altegio-sync.server");
            const rec = await altegioApi().record(body.company_id, body.resource_id);
            const row = rec === "missing" ? { record_id: body.resource_id, location_id: body.company_id, deleted: true, changed_at: new Date().toISOString(), services: [], amount: 0, attendance: 0, confirmed: false, payload: {} } : rec;
            if (row) { await applyRows(db, [row as never]); result = row.deleted ? "deleted" : "applied"; }
          }
        } catch (e) { result = "error"; error = e instanceof Error ? e.message.slice(0, 200) : "Ошибка"; }
        await db.from("altegio_events").update({ result, error }).eq("id", ev.data.id);
        return ok();
      },
    },
  },
});
