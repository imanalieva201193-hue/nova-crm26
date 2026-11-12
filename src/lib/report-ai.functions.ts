import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INSTRUCTIONS = `Ты — аналитик отдела продаж клиники Nova Clinic (Бишкек). По цифрам отчёта за период составь краткую сводку для руководителя (РОП / коммерческий директор).
Формат (на русском, без воды):
Итог периода: 2–3 предложения с главными цифрами.
Что хорошо: 2–3 пункта.
Проблемы: 2–3 пункта (низкая конверсия, много мусорных/потерянных/неявок, слабые каналы, менеджеры с низкой конверсией).
Что сделать: 3 конкретных действия на следующий период, включая реанимацию базы, если много потерянных и неявок.
Опирайся только на присланные цифры, не выдумывай данных. Если данных мало — так и скажи.`;

export const summarizeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string }) => ({ text: String(d.text).slice(0, 12000) }))
  .handler(async ({ data }) => {
    try {
      const { generateTextViaGateway } = await import("@/lib/ai.server");
      const text = await generateTextViaGateway(INSTRUCTIONS, data.text);
      if (!text.trim()) return { ok: false as const, error: "Модель не дала ответа" };
      return { ok: true as const, text };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("report AI error", status, e);
      const msg =
        status === 402
          ? "Закончились AI-кредиты — пополните баланс в настройках Lovable"
          : status === 429
            ? "Слишком много запросов, попробуйте через минуту"
            : status === 403
              ? "Доступ к AI запрещён настройками рабочего пространства"
              : "Не удалось получить сводку";
      return { ok: false as const, error: msg };
    }
  });
