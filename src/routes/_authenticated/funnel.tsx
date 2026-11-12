import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCrm } from "@/components/crm/context";
import { leadsQ, useDoctors, type Lead } from "@/components/crm/data";
import {
  BRANCH_FUNNELS,
  FUNNELS,
  bishkekDate,
  branchName,
  fmtDate,
  leadCategory,
  missingForStage,
  stageList,
  type FunnelCode,
} from "@/lib/crm";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/funnel")({
  head: () => ({
    meta: [
      { title: "Воронка — Nova CRM" },
      { name: "description", content: "Канбан заявок по этапам воронки филиала." },
      { property: "og:title", content: "Воронка — Nova CRM" },
      { property: "og:description", content: "Канбан заявок по этапам воронки филиала." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FunnelPage,
});

function FunnelPage() {
  const { branch, openLead } = useCrm();
  const qc = useQueryClient();
  const leads = useQuery(leadsQ(branch)).data ?? [];
  const doctors = useDoctors();
  const funnels: FunnelCode[] =
    branch === "all"
      ? ["nova_general", "nova_check", "nova_surgery", "rinos"]
      : (BRANCH_FUNNELS[branch] ?? []);
  const [funnel, setFunnel] = useState<FunnelCode | null>(null);
  const cur = funnel && funnels.includes(funnel) ? funnel : funnels[0]!;
  const today = bishkekDate();
  const list = leads.filter((l) => l.funnel === cur && !l.outcome);

  async function move(l: Lead, stage: number) {
    const miss = missingForStage(l, stage);
    if (miss.length) {
      toast.error("Для этого этапа заполните: " + miss.join(", "));
      openLead(l.id);
      return;
    }
    const { error } = await supabase.from("leads").update({ stage }).eq("id", l.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("lead_history").insert({ lead_id: l.id, changes: { stage } });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">Воронка</h1>
        {funnels.length > 1 && (
          <Tabs value={cur} onValueChange={(v) => setFunnel(v as FunnelCode)}>
            <TabsList>
              {funnels.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {FUNNELS[f].name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stageList(cur).map((s) => {
          const col = list.filter((l) => l.stage === s.n);
          return (
            <div
              key={s.n}
              className="w-64 shrink-0 rounded-xl bg-muted/70 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const l = leads.find((x) => x.id === e.dataTransfer.getData("id"));
                if (l && l.stage !== s.n) move(l, s.n);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{s.label}</span>
                <span className="rounded-full bg-card px-2 py-0.5">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((l) => {
                  const overdue = l.next_touch && l.next_touch < today;
                  return (
                    <button
                      key={l.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("id", l.id)}
                      onClick={() => openLead(l.id)}
                      className={
                        "block w-full rounded-lg border bg-card p-2.5 text-left text-sm shadow-sm transition hover:shadow-md " +
                        (overdue ? "border-destructive ring-1 ring-destructive/40" : "")
                      }
                    >
                      <div className="font-medium">{l.patient_name || l.phone}</div>
                      <div className="text-xs text-muted-foreground">
                        {doctors.find((d) => d.id === l.doctor_id)?.full_name ?? "врач не выбран"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        {l.visit_date && <span>визит {fmtDate(l.visit_date)}</span>}
                        {l.operation_cost ? (
                          <span>{Number(l.operation_cost).toLocaleString("ru-RU")} сом</span>
                        ) : null}
                        {branch === "all" && <span>{branchName(l.branch_code)}</span>}
                      </div>
                      <div className="mt-1 flex justify-between text-[11px]">
                        <span className="text-primary">{leadCategory(l)}</span>
                        {overdue && <span className="text-destructive">касание просрочено</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
