import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT2DESK_WEBHOOK_URL } from "@/lib/chat2desk";

export const registerChat2deskWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Подключение доступно только активному руководителю.");
    try {
      const { chat2deskApi } = await import("./chat2desk-api.server");
      const api = chat2deskApi(process.env["CHAT2DESK_API_TOKEN"], process.env["CHAT2DESK_API_HOST"]);
      const { headers } = api;
      const { host, response: list } = await api.select("/v1/webhooks");
      const json = await list.json() as { data?: { id: number | string; name: string }[] };
      const rows = Array.isArray(json) ? json : json.data;
      if (!Array.isArray(rows)) return { ok: false, message: "Chat2Desk вернул неизвестный формат списка подключений." };
      const existing = rows.find(row => row.name === "Nova CRM");
      if (existing && !/^\d+$/.test(String(existing.id))) return { ok: false, message: "Некорректный номер подключения Chat2Desk." };
      const response = await fetch(`${host}/v1/webhooks${existing ? `/${existing.id}` : ""}`, {
        method: existing ? "PUT" : "POST", headers, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ name: "Nova CRM", url: CHAT2DESK_WEBHOOK_URL, events: ["new_client", "new_request", "client_updated"] }),
      });
      // Relay only short, token-redacted errors, never arbitrary provider bodies.
      if (!response.ok) return { ok: false, message: await api.describeError(host, response) };
      return { ok: true, message: `Вебхук Nova CRM подключён в Chat2Desk (${host}).` };
    } catch (error) {
      return { ok: false, message: error instanceof Error && (error.message.startsWith("Не удалось подключить Chat2Desk:") || error.message.startsWith("Добавьте CHAT2DESK_API_TOKEN")) ? error.message : "Chat2Desk не ответил. Попробуйте подключить позже." };
    }
  });