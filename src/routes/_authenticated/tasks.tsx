import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import { leadsQ, type Lead } from "@/components/crm/data";
import { FINAL, REANIMATION, bishkekDate, fmtDate, FUNNELS, type FunnelCode } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Задачи — Nova CRM" },
      { name: "description", content: "Задачи на сегодня по филиалу." },
      { property: "og:title", content: "Задачи — Nova CRM" },
      { property: "og:description", content: "Задачи на сегодня по филиалу." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { branch, openLead } = useCrm();
  const leads = useQuery(leadsQ(branch)).data ?? [];
  const touches =
    useQuery({
      queryKey: ["touches-recent"],
      queryFn: async () =>
        (
          await supabase
            .from("touches")
            .select("lead_id, touched_at, no_answer")
            .eq("no_answer", true)
            .gte("touched_at", new Date(Date.now() - 3 * 86400_000).toISOString())
        ).data ?? [],
    }).data ?? [];
  const today = bishkekDate();
  const tomorrow = bishkekDate(new Date(Date.now() + 86400_000));
  const active = leads.filter((l) => !l.outcome && l.stage !== FINAL);
  const yearAgo = bishkekDate(new Date(Date.now() - 365 * 86400_000));
  const noAns = new Map<string, number>();
  touches.forEach((t) => noAns.set(t.lead_id, (noAns.get(t.lead_id) ?? 0) + 1));
  const groups: { title: string; items: Lead[] }[] = [
    {
      title: "Подтвердить завтрашние визиты",
      items: active.filter((l) => l.visit_date?.slice(0, 10) === tomorrow && !l.confirmed),
    },
    {
      title: "Визит прошёл, явка не отмечена",
      items: active.filter((l) => l.visit_date && l.visit_date.slice(0, 10) < today && !l.came),
    },
    {
      title: "3 попытки без ответа за 3 дня",
      items: active.filter((l) => (noAns.get(l.id) ?? 0) >= 3),
    },
    {
      title: "Дата операции прошла без отметки",
      items: active.filter(
        (l) =>
          FUNNELS[l.funnel as FunnelCode]?.surgery && l.operation_date && l.operation_date < today,
      ),
    },
    {
      title: "Нет следующего касания",
      items: active.filter((l) => !l.next_touch && l.stage !== REANIMATION),
    },
    {
      title: "Nova Check — отправить паспорт здоровья",
      items: active.filter((l) => l.funnel === "nova_check" && l.stage === 6),
    },
    {
      title: "Повторный чекап (прошёл год)",
      items: leads.filter(
        (l) =>
          l.funnel === "nova_check" && l.stage === FINAL && (l.visited_at ?? "9999") <= yearAgo,
      ),
    },
    {
      title: "База для реаниматора",
      items: leads.filter(
        (l) => l.outcome === "Потерянный" || l.outcome === "Не пришёл" || l.stage === REANIMATION,
      ),
    },
  ];
  return (
    <div>
      <h1 className="mb-4 font-display text-xl font-bold">Задачи на {fmtDate(today)}</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 flex justify-between text-sm font-semibold">
              {g.title}
              <span className="rounded-full bg-secondary px-2 text-secondary-foreground">
                {g.items.length}
              </span>
            </h2>
            <ul className="space-y-1">
              {g.items.slice(0, 30).map((l) => (
                <li key={l.id}>
                  <button
                    className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => openLead(l.id)}
                  >
                    {l.patient_name || l.phone}{" "}
                    <span className="text-xs text-muted-foreground">
                      {l.phone} · {fmtDate(l.visit_date ?? l.lead_date)}
                    </span>
                  </button>
                </li>
              ))}
              {!g.items.length && <li className="text-sm text-muted-foreground">Всё сделано</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
