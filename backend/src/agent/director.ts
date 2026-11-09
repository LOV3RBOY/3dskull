import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { assetPath, findAsset } from "../assets.js";
import { AGENT_BETAS, claude, imageBlock } from "../claude.js";
import { config } from "../config.js";
import { abortSignal, emit, setState, setUsage } from "../runs.js";
import { addMessage, loadTranscript, saveTranscript } from "../threads.js";
import { buildSystemPrompt, turnContext } from "./prompt.js";
import { executeTool, toolDefinitions, type ToolContext } from "./tools.js";

type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

export interface AgentRunArgs {
  runId: string;
  threadId: string;
  userId: string;
  text: string;
  attachmentIds: string[];
}

async function attachmentBlocks(ids: string[]): Promise<BetaContentBlockParam[]> {
  const blocks: BetaContentBlockParam[] = [];
  for (const id of ids.slice(0, 8)) {
    const a = findAsset(id);
    if (!a) continue;
    const img = await sharp(await readFile(assetPath(a)))
      .resize({ width: 768, height: 768, fit: "inside" })
      .flatten({ background: "#777777" })
      .jpeg({ quality: 80 })
      .toBuffer();
    blocks.push({ type: "text", text: `Attachment ${a.id} (${a.kind}${a.artist ? ` · ${a.artist}` : ""})` }, imageBlock(img));
  }
  return blocks;
}

export async function runAgent(args: AgentRunArgs): Promise<void> {
  const { runId, threadId } = args;
  const signal = abortSignal(runId);
  setState(runId, "running");
  emit(runId, "progress", { text: "Reading the brief…" });

  const transcript = loadTranscript(threadId);
  const userContent: BetaContentBlockParam[] = [
    { type: "text", text: `${turnContext(args.attachmentIds)}\n\n${args.text}` },
    ...(await attachmentBlocks(args.attachmentIds)),
  ];
  transcript.push({ role: "user", content: userContent });

  const ctx: ToolContext = {
    runId,
    threadId,
    userId: args.userId,
    previews: new Map(),
    delivered: [],
    onOutput: (o) => emit(runId, "output", { output: o }),
    signal,
  };

  const system = buildSystemPrompt();
  const tools = toolDefinitions();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
  let finalText = "";
  let jsonRetries = 0;
  let failure: string | undefined;

  try {
    for (let turn = 0; turn < config.anthropic.maxAgentTurns; turn++) {
      if (signal?.aborted) return;
      const stream = claude().beta.messages.stream(
        {
          model: config.anthropic.model,
          max_tokens: 32000,
          betas: AGENT_BETAS,
          fallbacks: "default",
          thinking: { type: "adaptive", display: "updates" },
          output_config: { effort: config.anthropic.effort },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools,
          messages: transcript,
          cache_control: { type: "ephemeral" },
        },
        { signal },
      );

      let turnText = "";
      stream.on("text", (delta) => {
        turnText += delta;
        emit(runId, "delta", { text: delta });
      });
      stream.on("contentBlock", (block) => {
        if (block.type === "thinking" && block.thinking?.trim()) emit(runId, "progress", { text: block.thinking.trim().slice(0, 400) });
      });

      let message: Anthropic.Beta.Messages.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (signal?.aborted || err instanceof Anthropic.APIUserAbortError) return;
        // With eager input streaming a tool input can arrive unparseable; re-issue the turn a couple of times.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        emit(runId, "progress", { text: "Retrying a garbled step…" });
        continue;
      }

      usage.turns++;
      usage.input += message.usage.input_tokens ?? 0;
      usage.output += message.usage.output_tokens ?? 0;
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

      if (message.stop_reason === "refusal") {
        failure = "The model declined this request. Try rephrasing the brief.";
        break;
      }

      // Append the full assistant content unchanged (thinking/fallback blocks included) — transcript stays append-only.
      transcript.push({ role: "assistant", content: message.content as BetaContentBlockParam[] });
      if (turnText.trim()) finalText = turnText.trim();

      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) break;
      if (message.stop_reason === "max_tokens") {
        // A truncated tool call must not run; tell the model and let it continue.
        transcript.push({
          role: "user",
          content: toolUses.map((t) => ({ type: "tool_result" as const, tool_use_id: t.id, is_error: true, content: "Your output hit the token limit and this call was truncated. Re-issue it more concisely." })),
        });
        continue;
      }

      // Run tools in parallel; return every result in ONE user message.
      const results = await Promise.all(
        toolUses.map(async (t) => {
          emit(runId, "tool", { id: t.id, name: t.name, label: t.name, phase: "start" });
          const r = await executeTool(t.name, t.input, ctx);
          emit(runId, "tool", { id: t.id, name: t.name, label: r.label, phase: "end", ok: !r.isError, detail: r.isError && typeof r.content === "string" ? r.content.slice(0, 300) : undefined });
          return { type: "tool_result" as const, tool_use_id: t.id, content: r.content, is_error: r.isError || undefined };
        }),
      );
      transcript.push({ role: "user", content: results });
      saveTranscript(threadId, transcript);
      if (signal?.aborted) return;
    }
  } catch (err) {
    if (signal?.aborted || err instanceof Anthropic.APIUserAbortError) return;
    if (err instanceof Anthropic.AuthenticationError) failure = "The server's Anthropic API key is invalid.";
    else if (err instanceof Anthropic.RateLimitError) failure = "Rate limited by the model provider — try again in a minute.";
    else if (err instanceof Anthropic.APIError) failure = `Model API error ${err.status ?? ""}: ${err.message}`;
    else failure = (err as Error).message;
    console.error("[agent] run failed", runId, err);
  } finally {
    setUsage(runId, usage);
  }

  // If the turn cap stopped us right after tool results, the next user turn simply merges with them.
  saveTranscript(threadId, transcript);

  if (failure) {
    const msg = addMessage(threadId, "assistant", `Something went wrong: ${failure}`, [], ctx.delivered.map((o) => o.id));
    emit(runId, "message", { message: msg });
    setState(runId, "failed", failure);
    return;
  }

  const text = finalText || (ctx.delivered.length ? "Done — your creative is in the Library." : "I couldn't complete that — can you add a bit more detail?");
  const msg = addMessage(threadId, "assistant", text, [], ctx.delivered.map((o) => o.id));
  emit(runId, "message", { message: msg });
  const asked = ctx.delivered.length === 0 && /\?\s*$|\?\s*\n/m.test(text);
  setState(runId, asked ? "needs_input" : "completed");
}
