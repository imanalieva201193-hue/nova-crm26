export const CHAT2DESK_WEBHOOK_URL = "https://nova-crm26.lovable.app/api/public/chat2desk-webhook";

export type MessengerEvent = {
  client_id: number | null;
  hook_type: string | null;
  transport: string | null;
  is_new_client: boolean | null;
  signature_valid: boolean;
  event_time: string | null;
};

export function messengerDate(time: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bishkek", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(time));
}

export function messengerBounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+06:00`);
  const end = new Date(`${to}T00:00:00+06:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function messengerMonth(now = new Date()) {
  const date = messengerDate(now.toISOString());
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${last}` };
}

export function messengerCounts(events: MessengerEvent[]) {
  const rows = events.filter(e => e.signature_valid && e.hook_type === "new_request");
  const clients = new Set(rows.flatMap(e => e.client_id === null ? [] : [e.client_id]));
  const fresh = new Set(rows.flatMap(e => e.client_id !== null && e.is_new_client === true ? [e.client_id] : []));
  return { requests: rows.length, unique: clients.size, fresh: fresh.size, repeat: clients.size - fresh.size };
}

export function messengerReport(events: MessengerEvent[]) {
  const rows = events.filter(e => e.signature_valid && e.hook_type === "new_request");
  const group = (key: (e: MessengerEvent) => string) => {
    const groups = new Map<string, MessengerEvent[]>();
    for (const row of rows) { const k = key(row); groups.set(k, [...(groups.get(k) ?? []), row]); }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, ...messengerCounts(items) }));
  };
  return {
    total: messengerCounts(rows),
    channels: group(e => e.transport || "Не указан"),
    days: group(e => e.event_time ? messengerDate(e.event_time) : "Не указана"),
  };
}