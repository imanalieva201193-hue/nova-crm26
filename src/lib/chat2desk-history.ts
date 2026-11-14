import type { Tables } from "@/integrations/supabase/types";
import { messengerBounds } from "./chat2desk";

export type HistoryEvent = Pick<Tables<"chat2desk_events">, "id" | "client_id" | "request_id" | "channel_id" | "transport" | "is_new_client" | "event_time" | "hook_type" | "signature_valid">;
export type HistoryClient = Tables<"chat2desk_clients">;
export function clientHistory(events: HistoryEvent[], clients: HistoryClient[], filters: { from: string; to: string; search: string; transport: string }) {
  const { start, end } = messengerBounds(filters.from, filters.to);
  const contacts = new Map(clients.map(c => [c.client_id, c]));
  const grouped = new Map<number, HistoryEvent[]>();
  const search = filters.search.trim().toLowerCase();
  for (const event of events) {
    if (!event.signature_valid || event.hook_type !== "new_request" || event.client_id == null || !event.event_time || event.event_time < start || event.event_time >= end) continue;
    if (filters.transport && event.transport !== filters.transport) continue;
    const client = contacts.get(event.client_id);
    if (search && ![client?.name, client?.phone, client?.messenger_id, String(event.client_id)].some(value => value?.toLowerCase().includes(search))) continue;
    grouped.set(event.client_id, [...(grouped.get(event.client_id) ?? []), event]);
  }
  return [...grouped].map(([id, rows]) => {
    const history = rows.sort((a, b) => (b.event_time ?? "").localeCompare(a.event_time ?? ""));
    return { id, client: contacts.get(id), history, fresh: history.some(e => e.is_new_client), channels: [...new Set(history.map(e => e.transport || "Не указан"))], last: history[0]?.event_time };
  }).sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || a.id - b.id);
}