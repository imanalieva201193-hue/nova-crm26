import { createContext, useContext } from "react";
import type { Employee } from "./data";
import type { EstimateItem } from "@/lib/crm";

export type NewLeadPreset = {
  branch_code?: string | undefined;
  doctor_id?: string | undefined;
  funnel?: string | undefined;
  items?: (EstimateItem & { service_id?: string | undefined })[] | undefined;
  foreigner?: boolean | undefined;
  parent_lead_id?: string | undefined;
  patient_name?: string | null | undefined;
  phone?: string | undefined;
};
export type Crm = {
  me: Employee;
  isAdmin: boolean;
  branch: string; // "all" or code
  setBranch: (b: string) => void;
  openLead: (id: string) => void;
  newLead: (preset?: NewLeadPreset) => void;
};
export const CrmContext = createContext<Crm | null>(null);
export function useCrm() {
  const c = useContext(CrmContext);
  if (!c) throw new Error("useCrm outside CRM shell");
  return c;
}
