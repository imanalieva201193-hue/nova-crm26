import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const id = z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^\d{1,16}$/).transform(Number)]).refine(Number.isSafeInteger).nullish();
const text = z.string().max(500).nullish();
export const chat2deskPayload = z.object({
  hook_type: z.enum(["new_client", "new_request", "client_updated"]),
  request_id: id, client_id: id, dialog_id: id, message_id: id, channel_id: id,
  transport: z.string().max(100).nullish(),
  is_new_client: z.union([z.boolean(), z.literal(0), z.literal(1), z.literal("true"), z.literal("false")]).nullish(),
  created: z.union([z.number().nonnegative().max(253402300799), z.string().regex(/^\d{1,12}$/).transform(Number)]).nullish(),
  event_time: z.union([z.string().max(64), z.number().nonnegative().max(253402300799)]).nullish(),
  client: z.object({ id, name: text, assigned_name: text, phone: text, client_phone: text }).nullish(),
});

export function verifyChat2desk(raw: string, signature: string | null, timestamp: string | null, token: string | undefined) {
  if (!token || !signature || !/^[a-f\d]{64}$/i.test(signature) || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  const key = createHash("md5").update(token).digest("hex");
  const expected = createHmac("sha256", key).update(raw + timestamp).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function prepareChat2deskEvent(raw: string, valid: boolean, now = new Date()) {
  const diagnostic = (reason: string) => ({
    hook_type: "diagnostic", event_key: `invalid:${crypto.randomUUID()}`, client_id: null,
    request_id: null, channel_id: null, transport: null, is_new_client: null,
    signature_valid: false, payload: { reason }, event_time: now.toISOString(),
  });
  // Unsigned input may contain private data or poison a valid retry's dedupe key.
  if (!valid) return diagnostic("Подпись отсутствует или неверна");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return diagnostic("Некорректный JSON"); }
  const result = chat2deskPayload.safeParse(parsed);
  if (!result.success) return diagnostic("Неподдерживаемое или некорректное событие");
  const p = result.data;
  const cid = p.client_id ?? p.client?.id ?? null;
  const supplied = p.event_time ?? p.created;
  const time = supplied === null || supplied === undefined ? now :
    new Date(typeof supplied === "number" || /^\d+(\.\d+)?$/.test(supplied) ? Number(supplied) * 1000 : supplied);
  if (!Number.isFinite(time.getTime()) || (p.hook_type === "new_request" && cid === null)) return diagnostic("Некорректный клиент или дата");
  // Request IDs dedupe retries; raw digest fallback distinguishes multiple updates/requests of one client.
  const identity = p.hook_type === "new_request" && p.request_id != null ? String(p.request_id) :
    p.hook_type === "new_client" && cid !== null ? String(cid) : createHash("sha256").update(raw).digest("hex");
  const payload = JSON.parse(JSON.stringify(p));
  return {
    hook_type: p.hook_type, event_key: `${p.hook_type}:${identity}`, client_id: cid,
    request_id: p.request_id ?? null, channel_id: p.channel_id ?? null,
    transport: p.transport ?? null,
    is_new_client: p.is_new_client == null ? null : p.is_new_client === true || p.is_new_client === 1 || p.is_new_client === "true",
    signature_valid: true, payload, event_time: time.toISOString(),
  };
}