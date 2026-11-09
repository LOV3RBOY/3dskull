import sharp from "sharp";
import { config } from "../config.js";

/**
 * Atmosphere plate generation. Plates are backgrounds only — rooms, light, texture,
 * haze — never people and never text. Real artist pixels never pass through a model.
 */

export type Aspect = "4:5" | "9:16" | "1:1" | "16:9" | "3:4";

export interface PlateRequest {
  prompt: string;
  aspect: Aspect;
  /** Optional style/venue reference images (real XS venue photos) */
  references?: Buffer[];
  seed?: number;
}

export interface PlateResult {
  data: Buffer;
  provider: string;
  model: string;
}

const NEGATIVE =
  "Absolutely no people, no faces, no hands, no silhouettes in focus, no text, no letters, no logos, no watermarks, no signage. No neon pink or electric blue. No lens-flare stars. Not CGI, not a render, not illustration.";

export function platePrompt(prompt: string) {
  return `${prompt.trim()}\n\nPhotographic direction: shot on a full-frame camera at night with fast prime lens (35mm or 50mm, f/1.4), high ISO with fine natural grain, true deep blacks, warm tungsten and champagne-gold practical light, subtle haze catching light beams, shallow depth of field, slight halation on highlights. Composition leaves calm dark negative space for typography in the lower third and centre. ${NEGATIVE}`;
}

export function activeImageProvider(): "gemini" | "bfl" | "openai" | null {
  const p = config.images.provider;
  if (p === "none") return null;
  if (p === "gemini" && config.images.geminiApiKey) return "gemini";
  if (p === "bfl" && config.images.bflApiKey) return "bfl";
  if (p === "openai" && config.images.openaiApiKey) return "openai";
  if (p !== "auto") return null;
  if (config.images.geminiApiKey) return "gemini";
  if (config.images.bflApiKey) return "bfl";
  if (config.images.openaiApiKey) return "openai";
  return null;
}

const DIMS: Record<Aspect, { w: number; h: number }> = {
  "4:5": { w: 1088, h: 1360 },
  "9:16": { w: 1088, h: 1920 },
  "1:1": { w: 1280, h: 1280 },
  "16:9": { w: 1920, h: 1088 },
  "3:4": { w: 1152, h: 1536 },
};

async function fetchJson(url: string, init: RequestInit, timeoutMs = 180_000): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).host} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function gemini(req: PlateRequest): Promise<PlateResult> {
  const model = config.images.geminiModel;
  const parts: unknown[] = [{ text: platePrompt(req.prompt) }];
  for (const ref of req.references ?? []) {
    const jpg = await sharp(ref).resize({ width: 1536, height: 1536, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    parts.push({ inline_data: { mime_type: "image/jpeg", data: jpg.toString("base64") } });
  }
  const j = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.images.geminiApiKey!, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: req.aspect, imageSize: "2K" } },
    }),
  });
  const respParts: any[] = j?.candidates?.[0]?.content?.parts ?? [];
  const img = respParts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const b64 = img?.inlineData?.data ?? img?.inline_data?.data;
  if (!b64) throw new Error(`Gemini returned no image (finishReason: ${j?.candidates?.[0]?.finishReason ?? "unknown"})`);
  return { data: Buffer.from(b64, "base64"), provider: "gemini", model };
}

async function bfl(req: PlateRequest): Promise<PlateResult> {
  const model = config.images.bflModel;
  const { w, h } = DIMS[req.aspect];
  const headers = { "x-key": config.images.bflApiKey!, "Content-Type": "application/json" };
  const body: Record<string, unknown> = { prompt: platePrompt(req.prompt), width: w, height: h, output_format: "png" };
  if (req.seed !== undefined) body.seed = req.seed;
  (req.references ?? []).slice(0, 8).forEach((ref, i) => {
    body[i === 0 ? "input_image" : `input_image_${i + 1}`] = ref.toString("base64");
  });
  const start = await fetchJson(`https://api.bfl.ai/v1/${encodeURIComponent(model)}`, { method: "POST", headers, body: JSON.stringify(body) });
  const pollUrl: string = start.polling_url;
  if (!pollUrl) throw new Error("BFL returned no polling_url");
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await fetchJson(pollUrl, { headers });
    if (p.status === "Ready") {
      const res = await fetch(p.result.sample, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`BFL download failed ${res.status}`);
      return { data: Buffer.from(await res.arrayBuffer()), provider: "bfl", model };
    }
    if (["Error", "Failed", "Request Moderated", "Content Moderated"].includes(p.status)) throw new Error(`BFL: ${p.status}`);
  }
  throw new Error("BFL generation timed out");
}

async function openai(req: PlateRequest): Promise<PlateResult> {
  const model = config.images.openaiModel;
  const { w, h } = DIMS[req.aspect];
  const size = `${w}x${h}`;
  const auth = { Authorization: `Bearer ${config.images.openaiApiKey}` };
  let j: any;
  if (req.references?.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", platePrompt(req.prompt));
    form.append("size", size);
    form.append("quality", "high");
    for (const [i, ref] of req.references.entries()) {
      const png = await sharp(ref).resize({ width: 1536, height: 1536, fit: "inside" }).png().toBuffer();
      form.append("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), `ref${i}.png`);
    }
    j = await fetchJson("https://api.openai.com/v1/images/edits", { method: "POST", headers: auth, body: form });
  } else {
    j = await fetchJson("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: platePrompt(req.prompt), size, quality: "high", output_format: "png", n: 1 }),
    });
  }
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { data: Buffer.from(b64, "base64"), provider: "openai", model };
}

export async function generatePlate(req: PlateRequest): Promise<PlateResult> {
  const provider = activeImageProvider();
  if (!provider) throw new Error("No image generation provider is configured (set GEMINI_API_KEY, BFL_API_KEY or OPENAI_API_KEY).");
  const result = provider === "gemini" ? await gemini(req) : provider === "bfl" ? await bfl(req) : await openai(req);
  // Normalise to a clean high-quality JPEG without any embedded metadata from the generator.
  const data = await sharp(result.data).rotate().jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
  return { ...result, data };
}
