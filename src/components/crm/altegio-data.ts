import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { FunnelRecord } from "@/lib/altegio";

export const altegioDataQ = queryOptions({
  queryKey: ["altegio-data"],
  queryFn: async () => {
    const rows: Omit<Tables<"altegio_records">, "payload">[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from("altegio_records").select("record_id,location_id,client_id,client_name,phone,phone_key,staff_id,staff_name,services,amount,visit_at,attendance,confirmed,created_user_id,created_at_altegio,changed_at_altegio,deleted,branch_code,direction,kind,lead_id,matched_existing,synced_at").order("record_id").range(offset, offset + 999);
      if (page.error) throw new Error("Не удалось прочитать записи Altegio.");
      rows.push(...page.data);
      if (page.data.length < 1000) break;
    }
    const [locations, staff, users, categories, employees, doctors, events, job] = await Promise.all([
      supabase.from("altegio_locations").select("*").order("location_id"),
      supabase.from("altegio_staff").select("*").order("name"),
      supabase.from("altegio_users").select("*").order("name"),
      supabase.from("altegio_categories").select("*").order("title"),
      supabase.from("employees").select("email,full_name").eq("active", true),
      supabase.from("doctors").select("id,full_name"),
      supabase.from("altegio_events").select("*").order("received_at", { ascending: false }).limit(100),
      supabase.from("altegio_jobs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if ([locations, staff, users, categories, employees, doctors, events, job].some(r => r.error)) throw new Error("Не удалось прочитать настройки Altegio.");
    const records: FunnelRecord[] = rows.map(r => {
      const creator = users.data?.find(u => u.user_id === r.created_user_id);
      const doctor = staff.data?.find(s => s.staff_id === r.staff_id && s.location_id === r.location_id);
      return { record_id: r.record_id, phone_key: r.phone_key, client_name: r.client_name, branch_code: r.branch_code, direction: r.direction, kind: r.kind, staff: doctor?.name ?? r.staff_name ?? "Не указан", doctor_id: doctor?.doctor_id ?? null, employee: employees.data?.find(e => e.email === creator?.employee_email)?.full_name ?? creator?.name ?? (r.created_user_id ? `Сотрудник #${r.created_user_id}` : "Не указан"), source: "Altegio", created_at: r.created_at_altegio, visit_at: r.visit_at, attendance: r.attendance, deleted: r.deleted, amount: r.amount };
    });
    return { rows, records, locations: locations.data ?? [], staff: staff.data ?? [], users: users.data ?? [], categories: categories.data ?? [], employees: employees.data ?? [], doctors: doctors.data ?? [], events: events.data ?? [], job: job.data };
  },
});