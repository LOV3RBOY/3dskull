import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!config.anthropic.apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey, maxRetries: 3, timeout: 15 * 60 * 1000 });
  return client;
}

export const anthropicConfigured = () => !!(config.anthropic.apiKey || process.env.ANTHROPIC_AUTH_TOKEN);

/** Betas used on every agent request: server-side refusal fallback + between-tool progress updates. */
export const AGENT_BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"];

/** Single-shot helper (vision analysis, parsing). Streams under the hood to avoid HTTP timeouts. */
export async function complete(args: {
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** JSON schema for structured output */
  jsonSchema?: Record<string, unknown>;
}): Promise<string> {
  const stream = claude().beta.messages.stream({
    model: config.anthropic.model,
    max_tokens: args.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort ?? "medium", ...(args.jsonSchema ? { format: { type: "json_schema" as const, schema: args.jsonSchema } } : {}) },
    system: args.system,
    messages: [{ role: "user", content: args.content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
  return msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export function imageBlock(data: Buffer, mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"): Anthropic.Beta.Messages.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } };
}
