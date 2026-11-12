import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

/** One-shot text generation through Lovable AI Gateway (Responses API), streamed and consumed server-side. */
export async function generateTextViaGateway(
  instructions: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI не настроен");
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      return res;
    },
  });
  const result = streamText({
    model: provider.responses(MODEL),
    system: instructions,
    messages: [{ role: "user", content: prompt }],
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return await result.text;
}
