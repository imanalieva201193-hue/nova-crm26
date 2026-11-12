import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { branchName, fmtDate, leadCategory, stageLabel } from "@/lib/crm";

const INSTRUCTIONS = `Ты — опытный старший менеджер отдела продаж клиники Nova Clinic (Бишкек). 
По данным заявки, заметкам и истории касаний предложи ОДИН конкретный следующий шаг для менеджера.
Ответ на русском, кратко, в формате:
Следующий шаг: …
Когда: …
Почему: … (1–2 предложения)
Что сказать пациенту: … (готовая короткая фраза для WhatsApp/звонка)
Правила: не обещай медицинских результатов и не ставь диагнозов; итоговую цену подтверждает врач; при рассрочке скидки и пакеты не действуют; не упоминай личные телефоны сотрудников; если 3 попытки без ответа за 3 дня — предложи закрыть как «Потерянный» или передать реаниматору.`;

export const suggestNextStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: lead, error } = await sb.from("leads").select("*").eq("id", data.leadId).single();
    if (error || !lead) return { ok: false as const, error: "Заявка не найдена или нет доступа" };
    const [{ data: touches }, { data: items }, { data: doctor }] = await Promise.all([
      sb
        .from("touches")
        .select("touched_at, channel, result, no_answer")
        .eq("lead_id", lead.id)
        .order("touched_at", { ascending: false })
        .limit(30),
      sb.from("lead_services").select("name, qty, price, currency").eq("lead_id", lead.id),
      lead.doctor_id
        ? sb
            .from("doctors")
            .select("full_name, specialty, schedule")
            .eq("id", lead.doctor_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const prompt = [
      `Сегодня: ${fmtDate(new Date(Date.now() + 6 * 3600_000).toISOString())}`,
      `Филиал: ${branchName(lead.branch_code)}; воронка: ${lead.funnel}; этап: ${stageLabel(lead.funnel, lead.stage)}; категория: ${leadCategory(lead)}`,
      `Пациент: ${lead.patient_name || "без имени"}; источник: ${lead.source}; линия: ${lead.line}; иностранец: ${lead.foreigner ? "да" : "нет"}; страховая: ${lead.insurance || "нет"}; рассрочка: ${lead.installment ? "да" : "нет"}`,
      `Врач: ${doctor ? `${doctor.full_name} (${doctor.specialty}), приём ${doctor.schedule}` : "не выбран"}; визит: ${fmtDate(lead.visit_date)}; подтверждено: ${lead.confirmed ? "да" : "нет"}; пришёл: ${lead.came ? "да" : "нет"}`,
      `Операция: ${fmtDate(lead.operation_date)}; стоимость: ${lead.operation_cost ?? "—"}; предоплата: ${lead.prepayment ?? "—"}`,
      `Исход: ${lead.outcome ? `${lead.outcome} (${lead.outcome_reason})` : "нет"}; следующее касание: ${fmtDate(lead.next_touch)}`,
      `Комментарий: ${lead.comment || "—"}`,
      `Смета: ${(items ?? []).map((i) => `${i.name} ×${i.qty} — ${i.price} ${i.currency}`).join("; ") || "пусто"}`,
      `Заметки и касания (новые сверху):\n${(touches ?? []).map((t) => `- ${fmtDate(t.touched_at)} ${t.channel}: ${t.no_answer ? "не ответил" : t.result || ""}`).join("\n") || "нет"}`,
    ].join("\n");
    try {
      const { generateTextViaGateway } = await import("@/lib/ai.server");
      const text = await generateTextViaGateway(INSTRUCTIONS, prompt);
      if (!text.trim()) return { ok: false as const, error: "Модель не дала ответа" };
      return { ok: true as const, text };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("next-step AI error", status, e);
      const msg =
        status === 402
          ? "Закончились AI-кредиты — пополните баланс в настройках Lovable"
          : status === 429
            ? "Слишком много запросов, попробуйте через минуту"
            : status === 403
              ? "Доступ к AI запрещён настройками рабочего пространства"
              : "Не удалось получить рекомендацию";
      return { ok: false as const, error: msg };
    }
  });
