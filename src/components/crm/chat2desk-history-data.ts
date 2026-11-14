import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HistoryClient, HistoryEvent } from "@/lib/chat2desk-history";

export const chat2deskHistoryQ = queryOptions({
  queryKey: ["chat2desk-client-history"],
  queryFn: async () => {
    const [events, clients] = await Promise.all([
      (async () => {
        const rows: HistoryEvent[] = [];
        for (let offset = 0; ; offset += 1000) {
          const res = await supabase.from("chat2desk_events").select("id,client_id,request_id,channel_id,transport,is_new_client,event_time,hook_type,signature_valid")
            .eq("signature_valid", true).eq("hook_type", "new_request").order("event_time", { ascending: false }).order("id").range(offset, offset + 999);
          if (res.error) throw res.error;
          rows.push(...(res.data ?? []));
          if (!res.data || res.data.length < 1000) return rows;
        }
      })(),
      (async () => {
        const rows: HistoryClient[] = [];
        for (let offset = 0; ; offset += 1000) {
          const res = await supabase.from("chat2desk_clients").select("*").order("client_id").range(offset, offset + 999);
          if (res.error) throw res.error;
          rows.push(...(res.data ?? []));
          if (!res.data || res.data.length < 1000) return rows;
        }
      })(),
    ]);
    return { events, clients };
  },
});