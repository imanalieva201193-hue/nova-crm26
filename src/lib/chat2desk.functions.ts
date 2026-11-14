import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT2DESK_WEBHOOK_URL } from "@/lib/chat2desk";

export const registerChat2deskWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Подключение доступно только активному руководителю.");
    const token = process.env["CHAT2DESK_API_TOKEN"]?.replace(/^[\s"']+|[\s"']+$/g, "");
    if (!token) return { ok: false, message: "Добавьте CHAT2DESK_API_TOKEN в секреты проекта." };
    const hosts = [...new Set([
      process.env["CHAT2DESK_API_HOST"]?.trim().replace(/\/+$/, ""),
      "https://api-rus02.chat2desk.com",
      "https://api.chat2desk.com",
    ].filter((host): host is string => Boolean(host)))];
    const failures: string[] = [];
    const hint = "Проверьте, что в CHAT2DESK_API_TOKEN сохранён токен целиком из Chat2Desk → API и скрипты → API → Показать";
    const failure = () => ({ ok: false, message: `Не удалось подключить Chat2Desk: ${failures.join("; ")}. ${hint}.` });
    const describeError = async (host: string, response: Response) => {
      let detail = "";
      try {
        const body = await response.json() as { errors?: unknown };
        if (typeof body.errors === "string" && body.errors.length <= 200) {
          detail = `: ${body.errors.split(token).join("[скрыто]").replace(/[\r\n]/g, " ")}`;
        }
      } catch { /* Provider errors need not be JSON. */ }
      return `${host} — код ${response.status}${detail}`;
    };
    try {
      const headers = { Authorization: token, "Content-Type": "application/json" };
      let host: string | undefined;
      let list: Response | undefined;
      for (const candidate of hosts) {
        let response: Response;
        try {
          response = await fetch(`${candidate}/v1/webhooks`, { headers, signal: AbortSignal.timeout(10000) });
        } catch {
          failures.push(`${candidate} — нет ответа`);
          return failure();
        }
        if (response.ok) { host = candidate; list = response; break; }
        failures.push(await describeError(candidate, response));
        if (response.status !== 403) return failure();
      }
      if (!host || !list) return failure();
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
      if (!response.ok) { failures.push(await describeError(host, response)); return failure(); }
      return { ok: true, message: `Вебхук Nova CRM подключён в Chat2Desk (${host}).` };
    } catch {
      return { ok: false, message: "Chat2Desk не ответил. Попробуйте подключить позже." };
    }
  });