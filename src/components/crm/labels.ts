import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WORKSPACES } from "@/lib/crm";

export const DEFAULT_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(WORKSPACES).map(([key, value]) => [key, value.title])),
  dashboard: "Главная",
  leads: "База пациентов",
  admins: "Админы",
  reports: "Отчёты",
  settings: "Настройки",
  control: "Контроль сотрудников",
  admin: "Сотрудники",
};
export const labelsQ = queryOptions({
  queryKey: ["crm-labels"],
  queryFn: async () => {
    const { data, error } = await supabase.from("crm_labels").select("*");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((row) => [row.key, row.title]));
  },
});
export function useLabels() {
  return { ...DEFAULT_LABELS, ...useQuery(labelsQ).data };
}
