import { z } from "zod";
import { messengerBounds } from "./chat2desk";
import { chat2deskApi } from "./chat2desk-api.server";

export type BackfillJob = {
  id: string; from_date: string; to_date: string; phase: string;
  cursor_start_id: number | null; clients_offset: number; api_calls: number;
  requests_imported: number; clients_imported: number; status: string; error: string | null;
  api_host: string | null;
};
const id = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const messageSchema = z.object({ id, client_id: id, request_id: id.nullish(), channel_id: id.nullish(), transport: z.string().max(100).nullish(), created: z.union([z.string(), z.number()]) });
const clientSchema = z.object({ id, name: z.string().max(500).nullish(), assigned_name: z.string().max(500).nullish(), phone: z.string().max(500).nullish(), client_phone: z.string().max(500).nullish() });
export type BackfillEvent = { client_id: number; request_id: number; channel_id: number | null; transport: string | null; event_time: string };
type Client = z.infer<typeof clientSchema>;
export type BackfillStore = {
  save: (job: BackfillJob) => Promise<void>;
  page: (job: BackfillJob, events: BackfillEvent[], clients: Client[]) => Promise<BackfillJob>;
  finish: (job: BackfillJob) => Promise<BackfillJob>;
};
export function messageTime(value: string | number) {
  const date = new Date(typeof value === "number" ? value * 1000 : value.replace(/ UTC$/, "Z").replace(" ", "T"));
  if (!Number.isFinite(date.getTime())) throw new Error("Chat2Desk вернул некорректную дату сообщения.");
  return date.toISOString();
}

// Sequential pages + durable cursor: retries never retain message bodies or repeat committed pages.
export async function runBackfillChunk(initial: BackfillJob, store: BackfillStore, token?: string, override?: string) {
  let job = { ...initial };
  const api = chat2deskApi(token, override);
  const { start, end } = messengerBounds(job.from_date, job.to_date);
  let calls = 0;
  const deadline = Date.now() + 20000;
  const beforeCall = async () => {
    if (calls >= 20) throw new Error("Достигнут предел запросов за один шаг. Продолжите загрузку.");
    calls += 1; job.api_calls += 1;
    await store.save(job); // Count attempts, including rejected hosts and timeouts.
  };
  while (calls < 18 && Date.now() < deadline && job.status === "running") {
    if (job.phase === "finalize") return store.finish(job);
    const params = new URLSearchParams({ order: "asc", limit: job.phase === "anchor" ? "1" : "200" });
    if (job.phase === "clients") params.set("created_after", String(Math.floor(new Date(start).getTime() / 1000)));
    else params.set("type", "from_client");
    if (job.phase === "anchor") {
      // API dates are UTC calendar dates; broaden the anchor, then enforce exact Bishkek bounds locally.
      params.set("start_date", start.slice(0, 10)); params.set("finish_date", end.slice(0, 10));
    } else if (job.phase === "messages") params.set("start_id", String(job.cursor_start_id));
    else params.set("offset", String(job.clients_offset));
    const path = () => `/v1/${job.phase === "clients" ? "clients" : "messages"}?${params}`;
    let selected;
    try { selected = await api.select(path(), beforeCall, job.api_host ?? undefined); }
    catch (error) {
      if (job.phase !== "anchor" || !(error instanceof Error) || !error.message.includes("Supported format: dd-mm-yyyy")) throw error;
      params.set("start_date", start.slice(0, 10).split("-").reverse().join("-"));
      params.set("finish_date", end.slice(0, 10).split("-").reverse().join("-"));
      selected = await api.select(path(), beforeCall, job.api_host ?? undefined);
    }
    const { host, response } = selected;
    job.api_host = host;
    const body = await response.json() as { data?: unknown[]; meta?: { total?: number } };
    if (!Array.isArray(body.data)) throw new Error("Chat2Desk вернул неизвестный формат истории.");
    if (job.phase === "anchor") {
      if (!body.data.length) return store.finish(job);
      job.cursor_start_id = messageSchema.parse(body.data[0]).id;
      job.phase = "messages";
      job = await store.page(job, [], []);
    } else if (job.phase === "messages") {
      const messages = body.data.map(item => messageSchema.parse(item));
      const grouped = new Map<number, BackfillEvent>();
      let pastEnd = false;
      for (const message of messages) {
        const time = messageTime(message.created);
        if (time >= end) { pastEnd = true; continue; }
        if (time < start || message.request_id == null) continue;
        const previous = grouped.get(message.request_id);
        if (!previous || time < previous.event_time) grouped.set(message.request_id, {
          client_id: message.client_id, request_id: message.request_id, channel_id: message.channel_id ?? null,
          transport: message.transport ?? null, event_time: time,
        });
      }
      const last = messages.at(-1);
      if (last) {
        if (last.id < (job.cursor_start_id ?? 0) || last.id >= Number.MAX_SAFE_INTEGER) throw new Error("Chat2Desk вернул некорректный указатель истории.");
        job.cursor_start_id = last.id + 1;
      }
      if (!messages.length || pastEnd) job.phase = "clients";
      job = await store.page(job, [...grouped.values()], []);
    } else {
      const clients = body.data.map(item => clientSchema.parse(item)); // Strips every other field.
      const total = Number(body.meta?.total);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("Chat2Desk не указал число клиентов для продолжения загрузки.");
      job.clients_offset += clients.length;
      if (job.clients_offset >= total) job.phase = "finalize";
      else if (!clients.length) throw new Error("Chat2Desk вернул пустую страницу клиентов до конца списка. Продолжите позже.");
      job = await store.page(job, [], clients);
    }
  }
  if (job.phase === "finalize") return store.finish(job);
  return job;
}