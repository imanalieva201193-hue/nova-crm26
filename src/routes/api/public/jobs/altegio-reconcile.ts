import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/altegio-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { reconcile } = await import("@/lib/altegio-sync.server");
        try {
          const total = await reconcile(db);
          await db.from("altegio_events").insert({ resource: "reconcile", status: "hourly", result: `records:${total}` });
          return Response.json({ success: true, total });
        } catch (e) {
          await db.from("altegio_events").insert({ resource: "reconcile", status: "hourly", result: "error", error: e instanceof Error ? e.message.slice(0, 200) : "Ошибка" });
          return Response.json({ success: false });
        }
      },
    },
  },
});
