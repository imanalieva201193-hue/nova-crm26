import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/components/crm/context";
import type { Lead } from "@/components/crm/data";
import { BRANCHES, bishkekDate } from "@/lib/crm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admins")({
  head: () => ({
    meta: [
      { title: "Админы — Nova CRM" },
      { name: "description", content: "Визиты дня: подтверждение и отметка прихода пациентов." },
      { property: "og:title", content: "Админы — Nova CRM" },
      {
        property: "og:description",
        content: "Визиты дня: подтверждение и отметка прихода пациентов.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminsPage,
});

function AdminsPage() {
  const { branch, openLead, me } = useCrm();
  const qc = useQueryClient();
  const today = bishkekDate();
  const [day, setDay] = useState(today);
  const q = useQuery({
    queryKey: ["admins-visits", branch, day],
    queryFn: async () => {
      let r = supabase
        .from("leads")
        .select("*")
        .is("outcome", null)
        .gte("visit_date", day + "T00:00:00+06:00")
        .lte("visit_date", day + "T23:59:59+06:00")
        .order("visit_date");
      if (branch !== "all") r = r.eq("branch_code", branch);
      const { data, error } = await r;
      if (error) throw error;
      return data ?? [];
    },
  });
  const list = q.data ?? [];
  async function mark(l: Lead, patch: Partial<Lead>) {
    const { error } = await supabase.from("leads").update(patch).eq("id", l.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase
      .from("lead_history")
      .insert({ lead_id: l.id, author_email: me.email, changes: patch as never });
    qc.invalidateQueries();
  }
  const pending = list.filter((l) => !l.came && day < today).length;
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Администраторы филиалов
        </div>
        <h1 className="font-display text-4xl font-bold">Админы</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          className="w-44"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">Визитов: {list.length}</span>
        {pending > 0 && (
          <span className="text-sm font-semibold text-destructive">Не отмечено: {pending}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              {["Время", "Пациент", "Телефон", "Филиал", "Подтверждён", "Явка", ""].map((h) => (
                <th key={h} className="py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((l) => {
              const red = !l.came && day < today;
              return (
                <tr
                  key={l.id}
                  className={`border-t ${red ? "bg-destructive/10 text-destructive" : ""}`}
                >
                  <td className="py-2">
                    {l.visit_date &&
                      new Date(l.visit_date).toLocaleTimeString("ru-RU", {
                        timeZone: "Asia/Bishkek",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </td>
                  <td>
                    <button className="hover:underline" onClick={() => openLead(l.id)}>
                      {l.patient_name || "—"}
                    </button>
                  </td>
                  <td>{l.phone}</td>
                  <td>{BRANCHES.find((b) => b.code === l.branch_code)?.short}</td>
                  <td>
                    {l.confirmed ? (
                      "Да"
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mark(l, { confirmed: true })}
                      >
                        Подтвердить
                      </Button>
                    )}
                  </td>
                  <td>{l.came ? "Пришёл" : red ? "Не отмечено" : "—"}</td>
                  <td className="space-x-2 text-right">
                    {!l.came && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            mark(l, { came: true, visited_at: day, stage: Math.max(l.stage, 5) })
                          }
                        >
                          Пришёл
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mark(l, {
                              outcome: "Не пришёл",
                              outcome_reason: "Отмечено администратором",
                            })
                          }
                        >
                          Не пришёл
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={7} className="py-4 text-muted-foreground">
                  Визитов на эту дату нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
