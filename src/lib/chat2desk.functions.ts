import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT2DESK_WEBHOOK_URL } from "@/lib/chat2desk";

export const registerChat2deskWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Подключение доступно только активному руководителю.");
    const token = process.env["CHAT2DESK_API_TOKEN"];
    if (!token) return { ok: false, message: "Добавьте CHAT2DESK_API_TOKEN в секреты проекта." };
    try {
      const headers = { Authorization: token, "Content-Type": "application/json" };
      const list = await fetch("https://api.chat2desk.com/v1/webhooks", { headers, signal: AbortSignal.timeout(10000) });
      if (!list.ok) return { ok: false, message: `Chat2Desk не предоставил список подключений (код ${list.status}).` };
      const json = await list.json() as { data?: { id: number | string; name: string }[] };
      const rows = Array.isArray(json) ? json : json.data;
      if (!Array.isArray(rows)) return { ok: false, message: "Chat2Desk вернул неизвестный формат списка подключений." };
      const existing = rows.find(row => row.name === "Nova CRM");
      if (existing && !/^\d+$/.test(String(existing.id))) return { ok: false, message: "Некорректный номер подключения Chat2Desk." };
      const response = await fetch(`https://api.chat2desk.com/v1/webhooks${existing ? `/${existing.id}` : ""}`, {
        method: existing ? "PUT" : "POST", headers, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ name: "Nova CRM", url: CHAT2DESK_WEBHOOK_URL, events: ["new_client", "new_request", "client_updated"] }),
      });
      // Do not relay arbitrary provider bodies: they may echo credentials or private data.
      return { ok: response.ok, message: response.ok ? "Вебхук Nova CRM подключён в Chat2Desk." : `Chat2Desk не сохранил подключение (код ${response.status}).` };
    } catch {
      return { ok: false, message: "Chat2Desk не ответил. Попробуйте подключить позже." };
    }
  });