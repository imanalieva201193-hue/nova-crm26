import { createFileRoute } from "@tanstack/react-router";

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const Route = createFileRoute("/api/public/chat2desk-webhook")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        // Bound reads, including chunked bodies, before decoding or parsing untrusted input.
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 262144) { await reader.cancel(); return Response.json({ ok: true }); }
            chunks.push(value);
          }
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const raw = new TextDecoder().decode(bytes);
        const { verifyChat2desk, prepareChat2deskEvent } = await import("@/lib/chat2desk.server");
        const valid = verifyChat2desk(raw, request.headers.get("X-Signature"), request.headers.get("X-Timestamp"), process.env["CHAT2DESK_API_TOKEN"]);
        const event = prepareChat2deskEvent(raw, valid);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Invalid input is reduced to a non-personal diagnostic record. No client writes occur.
        const { error } = await supabaseAdmin.rpc("ingest_chat2desk_event", { _event: event });
        if (error) console.error("Chat2Desk: событие не сохранено");
      } catch {
        console.error("Chat2Desk: ошибка обработки события");
      }
      return Response.json({ ok: true });
    },
    GET: notAllowed, PUT: notAllowed, PATCH: notAllowed, DELETE: notAllowed, OPTIONS: notAllowed, HEAD: notAllowed,
  } },
});