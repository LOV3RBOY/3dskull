import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fs from "node:fs";
import { z } from "zod";
import { runAgent } from "./agent/director.js";
import { parseLineup } from "./agent/parse.js";
import { ASSET_KINDS, assetToApi, createAsset, deleteAsset, getAsset, listAssets, updateAsset, type AssetKind } from "./assets.js";
import { createUser, deleteUser, findUserByEmail, listUsers, requireAuth, requireRole, signToken, verifyPassword } from "./auth.js";
import { analyzeReference, getDna, rebuildDna } from "./brand/dna.js";
import { getProfile, updateProfile, type BrandProfile } from "./brand/profile.js";
import { anthropicConfigured } from "./claude.js";
import { config } from "./config.js";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./events.js";
import { activeCutoutProvider } from "./imaging/cutout.js";
import { activeImageProvider } from "./imaging/plates.js";
import { deleteOutput, getOutput, listOutputs, patchOutput, rerenderOutput } from "./outputs.js";
import { FORMAT_IDS, type FormatId } from "./render/formats.js";
import { rendererAvailable } from "./render/renderer.js";
import { TEMPLATES } from "./render/templates/xs.js";
import { cancelRun, createRun, enqueue, getRunRow, runToApi, subscribe } from "./runs.js";
import { filePath, mimeFor, noteOrigin, verifySignature } from "./storage.js";
import { addMessage, createThread, deleteThread, getThreadRow, listMessages, listThreads, threadToApi, touchThread } from "./threads.js";
import { badRequest, HttpError } from "./util/errors.js";

const VERSION = "1.0.0";

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

const editor = requireRole("admin", "editor");
const admin = requireRole("admin");

function startAgentRun(threadId: string, userId: string, text: string, attachmentAssetIds: string[]) {
  if (!anthropicConfigured()) throw new HttpError(503, "not_configured", "The server has no ANTHROPIC_API_KEY configured.");
  for (const id of attachmentAssetIds) getAsset(id);
  const message = addMessage(threadId, "user", text, attachmentAssetIds);
  const runId = createRun(threadId);
  enqueue(() => runAgent({ runId, threadId, userId, text, attachmentIds: attachmentAssetIds }));
  return { message, runId };
}

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 2 * 1024 * 1024, trustProxy: true });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 60 * 1024 * 1024, files: 1 } });

  app.addHook("onRequest", async (req) => {
    if (!config.publicBaseUrl && req.headers.host) noteOrigin(`${req.protocol}://${req.headers.host}`);
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: { code: err.code ?? "error", message: status >= 500 ? "Internal server error" : err.message } });
  });

  // ── public ──────────────────────────────────────────────────────────────
  app.get("/health", async () => ({ ok: true, version: VERSION }));

  app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const u = findUserByEmail(body.email);
    if (!u || !verifyPassword(body.password, u.passwordHash)) throw new HttpError(401, "invalid_credentials", "Incorrect email or password");
    const { passwordHash: _ph, ...user } = u;
    return { token: signToken(user), user };
  });

  app.get("/files/*", async (req: FastifyRequest<{ Params: { "*": string }; Querystring: { exp?: string; sig?: string } }>, reply) => {
    const key = req.params["*"];
    if (!verifySignature(key, Number(req.query.exp), String(req.query.sig ?? ""))) throw new HttpError(403, "bad_signature", "Link expired or invalid");
    const p = filePath(key);
    if (!fs.existsSync(p)) throw new HttpError(404, "not_found", "File not found");
    reply.header("Cache-Control", "private, max-age=86400, immutable");
    reply.type(mimeFor(key));
    return reply.send(fs.createReadStream(p));
  });

  // ── authenticated ───────────────────────────────────────────────────────
  app.register(async (r) => {
    r.addHook("preHandler", requireAuth);

    r.get("/me", async (req) => req.user);

    r.get("/system/status", async () => ({
      anthropic: anthropicConfigured(),
      model: config.anthropic.model,
      imageProvider: activeImageProvider(),
      cutoutProvider: activeCutoutProvider(),
      renderer: await rendererAvailable(),
    }));

    // users
    r.get("/users", { preHandler: admin }, async () => listUsers());
    r.post("/users", { preHandler: admin }, async (req) => {
      const b = parse(z.object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(8), role: z.enum(["admin", "editor", "viewer"]) }), req.body);
      if (findUserByEmail(b.email)) throw new HttpError(409, "exists", "A user with that email already exists");
      return createUser(b);
    });
    r.delete("/users/:id", { preHandler: admin }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (req.params.id === req.user!.id) throw badRequest("You can't delete yourself");
      deleteUser(req.params.id);
      return reply.status(204).send();
    });

    // studio
    const MessageBody = z.object({ text: z.string().trim().min(1).max(8000), attachmentAssetIds: z.array(z.string()).max(12).default([]) });

    r.post("/create", { preHandler: editor }, async (req) => {
      const b = parse(z.object({ prompt: z.string().trim().min(1).max(8000), attachmentAssetIds: z.array(z.string()).max(12).default([]) }), req.body);
      const thread = createThread(req.user!.id, b.prompt.replace(/\s+/g, " ").slice(0, 80));
      const { runId } = startAgentRun(thread.id, req.user!.id, b.prompt, b.attachmentAssetIds);
      return { thread: threadToApi(getThreadRow(thread.id)), runId };
    });

    r.get("/threads", async () => listThreads());
    r.post("/threads", { preHandler: editor }, async (req) => {
      const b = parse(z.object({ title: z.string().max(120).optional() }), req.body);
      return threadToApi(createThread(req.user!.id, b.title ?? "New request"));
    });
    r.get("/threads/:id", async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const t = getThreadRow(req.params.id);
      return { thread: threadToApi(t), messages: listMessages(t.id), outputs: listOutputs({ threadId: t.id, limit: 200 }) };
    });
    r.delete("/threads/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      deleteThread(req.params.id);
      return reply.status(204).send();
    });
    r.post("/threads/:id/messages", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const t = getThreadRow(req.params.id);
      const b = parse(MessageBody, req.body);
      const msgs = listMessages(t.id);
      if (!msgs.length) touchThread(t.id, b.text.replace(/\s+/g, " ").slice(0, 80));
      return startAgentRun(t.id, req.user!.id, b.text, b.attachmentAssetIds);
    });

    r.get("/runs/:id", async (req: FastifyRequest<{ Params: { id: string } }>) => runToApi(getRunRow(req.params.id)));
    r.post("/runs/:id/cancel", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => cancelRun(req.params.id));
    r.get("/runs/:id/events", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      getRunRow(req.params.id);
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      let closed = false;
      const heartbeat = setInterval(() => !closed && res.write(": ping\n\n"), 15000);
      const unsubscribe = subscribe(req.params.id, (e) => {
        if (closed) return;
        res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
        if (e.type === "done") {
          closed = true;
          clearInterval(heartbeat);
          setImmediate(() => {
            unsubscribe?.();
            res.end();
          });
        }
      });
      req.raw.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      });
    });

    // outputs
    r.get("/outputs", async (req: FastifyRequest<{ Querystring: Record<string, string> }>) => {
      const q = req.query;
      return listOutputs({ kind: q.kind, status: q.status, q: q.q, limit: q.limit ? Number(q.limit) : 50, before: q.before, favorite: q.favorite === "true" });
    });
    r.get("/outputs/:id", async (req: FastifyRequest<{ Params: { id: string } }>) => getOutput(req.params.id));
    r.patch("/outputs/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const b = parse(z.object({ status: z.enum(["draft", "approved", "rejected"]).optional(), favorite: z.boolean().optional(), title: z.string().max(120).optional(), text: z.string().max(8000).optional() }), req.body);
      return patchOutput(req.params.id, b);
    });
    r.delete("/outputs/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      await deleteOutput(req.params.id);
      return reply.status(204).send();
    });
    r.post("/outputs/:id/rerender", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const b = parse(
        z.object({
          fields: z.record(z.string(), z.string().max(400)).optional(),
          format: z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]).optional(),
          template: z.string().optional(),
        }),
        req.body,
      );
      return rerenderOutput(req.params.id, b);
    });

    // assets
    r.get("/assets", async (req: FastifyRequest<{ Querystring: Record<string, string> }>) =>
      listAssets({ kind: req.query.kind, artist: req.query.artist, q: req.query.q }).map(assetToApi),
    );
    r.post("/assets", { preHandler: editor }, async (req) => {
      const file = await req.file();
      if (!file) throw badRequest("Missing file");
      const data = await file.toBuffer();
      const fields = Object.fromEntries(
        Object.entries(file.fields).map(([k, v]) => [k, v && typeof v === "object" && "value" in v ? String((v as { value: unknown }).value) : undefined]),
      ) as Record<string, string | undefined>;
      const kind = (fields.kind ?? "artist_photo") as AssetKind;
      if (!ASSET_KINDS.includes(kind)) throw badRequest(`kind must be one of ${ASSET_KINDS.join(", ")}`);
      const row = await createAsset({
        data,
        kind,
        title: fields.title,
        artist: fields.artist,
        tags: fields.tags?.split(",") ?? [],
        userId: req.user!.id,
      });
      if (kind === "brand_reference" && anthropicConfigured()) analyzeReference(row.id).catch((e) => app.log.warn(e, "reference analysis failed"));
      return assetToApi(row);
    });
    r.patch("/assets/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => {
      const b = parse(
        z.object({ title: z.string().max(200).optional(), artist: z.string().max(200).nullable().optional(), tags: z.array(z.string()).max(50).optional(), kind: z.enum(ASSET_KINDS).optional() }),
        req.body,
      );
      return assetToApi(updateAsset(req.params.id, b));
    });
    r.delete("/assets/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      await deleteAsset(req.params.id);
      return reply.status(204).send();
    });

    // events
    r.get("/events", async (req: FastifyRequest<{ Querystring: Record<string, string> }>) => listEvents({ from: req.query.from, to: req.query.to, artist: req.query.artist }));
    r.post("/events", { preHandler: editor }, async (req) => createEvent(req.body));
    r.patch("/events/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>) => updateEvent(req.params.id, req.body));
    r.delete("/events/:id", { preHandler: editor }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      deleteEvent(req.params.id);
      return reply.status(204).send();
    });
    r.post("/events/parse", { preHandler: editor }, async (req) => {
      if (!anthropicConfigured()) throw new HttpError(503, "not_configured", "The server has no ANTHROPIC_API_KEY configured.");
      const b = parse(z.object({ text: z.string().min(3).max(20000) }), req.body);
      return parseLineup(b.text);
    });

    // brand
    r.get("/brand", async () => {
      const { dna, updatedAt } = getDna();
      return { profile: getProfile(), dna, dnaUpdatedAt: updatedAt, referenceCount: listAssets({ kind: "brand_reference", limit: 10000 }).length };
    });
    r.put("/brand/profile", { preHandler: editor }, async (req) => {
      const b = req.body as Partial<BrandProfile>;
      if (!b || typeof b !== "object" || Array.isArray(b)) throw badRequest("Body must be an object");
      return updateProfile(b);
    });
    r.post("/brand/references", { preHandler: editor }, async (req) => {
      const file = await req.file();
      if (!file) throw badRequest("Missing file");
      const row = await createAsset({ data: await file.toBuffer(), kind: "brand_reference", title: "XS reference post", userId: req.user!.id });
      if (anthropicConfigured()) analyzeReference(row.id).catch((e) => app.log.warn(e, "reference analysis failed"));
      return assetToApi(row);
    });
    r.post("/brand/dna/rebuild", { preHandler: editor }, async () => {
      if (!anthropicConfigured()) throw new HttpError(503, "not_configured", "The server has no ANTHROPIC_API_KEY configured.");
      return { dna: await rebuildDna() };
    });

    // templates
    r.get("/templates", async () =>
      TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, kinds: t.kinds, fields: t.fields.map((f) => ({ key: f.key, label: f.label, multiline: f.multiline })) })),
    );
  });

  return app;
}
