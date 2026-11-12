import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCrm } from "@/components/crm/context";
import { leadsQ, partnersQ } from "@/components/crm/data";
import { FINAL, fmtMoney } from "@/lib/crm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/partners")({
  head: () => ({
    meta: [
      { title: "Партнёры — Nova CRM" },
      { name: "description", content: "Агентская программа: партнёры, пациенты и бонусы." },
      { property: "og:title", content: "Партнёры — Nova CRM" },
      { property: "og:description", content: "Агентская программа: партнёры, пациенты и бонусы." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnersPage,
});

function PartnersPage() {
  const { isAdmin } = useCrm();
  const qc = useQueryClient();
  const partners = useQuery(partnersQ).data ?? [];
  const leads = useQuery(leadsQ("all")).data ?? [];
  const [n, setN] = useState({
    name: "",
    type: "",
    specialty: "",
    clinic: "",
    city: "Бишкек",
    bonus: "",
  });
  async function add() {
    if (!n.name) {
      toast.error("Укажите имя");
      return;
    }
    const { error } = await supabase
      .from("partners")
      .insert({
        name: n.name,
        type: n.type,
        specialty: n.specialty,
        clinic: n.clinic,
        city: n.city,
        bonus_per_operation: Number(n.bonus || 0),
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setN({ name: "", type: "", specialty: "", clinic: "", city: "Бишкек", bonus: "" });
    qc.invalidateQueries({ queryKey: ["partners"] });
  }
  return (
    <div>
      <h1 className="mb-4 font-display text-xl font-bold">Партнёры — агентская программа</h1>
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border bg-card p-3">
          {(["name", "type", "specialty", "clinic", "city", "bonus"] as const).map((k) => (
            <Input
              key={k}
              className="w-40"
              placeholder={
                {
                  name: "Имя",
                  type: "Тип",
                  specialty: "Специальность",
                  clinic: "Клиника",
                  city: "Город",
                  bonus: "Бонус за операцию",
                }[k]
              }
              value={n[k]}
              onChange={(e) => setN({ ...n, [k]: e.target.value })}
            />
          ))}
          <Button onClick={add}>Добавить</Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {partners.map((p) => {
          const pl = leads.filter((l) => l.partner_id === p.id);
          const ops = pl.filter((l) => l.stage === FINAL && l.operation_date).length;
          return (
            <div key={p.id} className="rounded-xl border bg-card p-4">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {[p.type, p.specialty, p.clinic, p.city].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-3 grid grid-cols-3 text-center text-sm">
                <div>
                  <div className="text-lg font-bold">{pl.length}</div>пациентов
                </div>
                <div>
                  <div className="text-lg font-bold">{ops}</div>операций
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {fmtMoney(ops * Number(p.bonus_per_operation ?? 0))}
                  </div>
                  бонус
                </div>
              </div>
            </div>
          );
        })}
        {!partners.length && <p className="text-sm text-muted-foreground">Партнёров пока нет.</p>}
      </div>
    </div>
  );
}
