import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Lead = Tables<"leads">;
export type Doctor = Tables<"doctors">;
export type Service = Tables<"services">;
export type Employee = Tables<"employees">;

async function all<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export const doctorsQ = queryOptions({
  queryKey: ["doctors"],
  queryFn: () => all(supabase.from("doctors").select("*").order("full_name")),
});
export const lookupsQ = queryOptions({
  queryKey: ["lookups"],
  queryFn: () => all(supabase.from("lookups").select("*").order("value")),
});
export const partnersQ = queryOptions({
  queryKey: ["partners"],
  queryFn: () => all(supabase.from("partners").select("*").order("name")),
});
export const employeesQ = queryOptions({
  queryKey: ["employees"],
  queryFn: () => all(supabase.from("employees").select("*").order("full_name")),
});
export const servicesQ = queryOptions({
  queryKey: ["services"],
  queryFn: async () => {
    const out: Service[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await all(
        supabase
          .from("services")
          .select("*")
          .order("direction")
          .order("name")
          .range(from, from + 999),
      );
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  },
});
export const leadsQ = (branch: string) =>
  queryOptions({
    queryKey: ["leads", branch],
    queryFn: async () => {
      const result: Lead[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, from + 999);
        if (branch !== "all") q = q.eq("branch_code", branch);
        const page = await all(q);
        result.push(...page);
        if (page.length < 1000) break;
      }
      return result;
    },
  });

export function useLookups(kind: string) {
  const { data } = useQuery(lookupsQ);
  return (data ?? []).filter((l) => l.kind === kind).map((l) => l.value);
}
export function useDoctors() {
  return useQuery(doctorsQ).data ?? [];
}

export const workspaceDataQ = queryOptions({
  queryKey: ["workspace-data"],
  queryFn: async () => {
    const leads: Lead[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await all(
        supabase
          .from("leads")
          .select("*")
          .order("id")
          .range(from, from + 999),
      );
      leads.push(...page);
      if (page.length < 1000) break;
    }
    const revenue: Record<string, number> = {};
    const { leadRevenue } = await import("@/lib/crm");
    for (let from = 0; from < leads.length; from += 200) {
      const batch = leads.slice(from, from + 200).filter((l) => l.stage === 10);
      if (!batch.length) continue;
      const items: Tables<"lead_services">[] = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await all(
          supabase
            .from("lead_services")
            .select("*")
            .in(
              "lead_id",
              batch.map((l) => l.id),
            )
            .order("id")
            .range(offset, offset + 999),
        );
        items.push(...page);
        if (page.length < 1000) break;
      }
      for (const lead of batch)
        revenue[lead.id] = leadRevenue(
          lead,
          items.filter((i) => i.lead_id === lead.id),
          lead.foreigner,
        );
    }
    return { leads, revenue };
  },
});
