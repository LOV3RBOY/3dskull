import sharp from "sharp";
import { config } from "../config.js";

/** Subject cut-out (background removal). Non-generative: the subject's pixels are preserved. */
export function activeCutoutProvider(): "photoroom" | "removebg" | "fal" | null {
  const p = config.images.cutoutProvider;
  if (p === "none") return null;
  if (p === "photoroom" && config.images.photoroomKey) return "photoroom";
  if (p === "removebg" && config.images.removeBgKey) return "removebg";
  if (p === "fal" && config.images.falKey) return "fal";
  if (p !== "auto") return null;
  if (config.images.photoroomKey) return "photoroom";
  if (config.images.removeBgKey) return "removebg";
  if (config.images.falKey) return "fal";
  return null;
}

export async function removeBackground(image: Buffer): Promise<Buffer> {
  const provider = activeCutoutProvider();
  if (!provider) throw new Error("No cut-out provider configured. Use 'Lift subject' in the iOS app, or set PHOTOROOM_API_KEY / REMOVE_BG_API_KEY / FAL_KEY.");
  const jpg = await sharp(image).rotate().resize({ width: 4000, height: 4000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
  const blob = new Blob([new Uint8Array(jpg)], { type: "image/jpeg" });
  let out: Buffer;
  if (provider === "photoroom") {
    const form = new FormData();
    form.append("image_file", blob, "photo.jpg");
    const res = await fetch("https://sdk.photoroom.com/v1/segment", { method: "POST", headers: { "x-api-key": config.images.photoroomKey! }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Photoroom ${res.status}: ${(await res.text()).slice(0, 300)}`);
    out = Buffer.from(await res.arrayBuffer());
  } else if (provider === "removebg") {
    const form = new FormData();
    form.append("image_file", blob, "photo.jpg");
    form.append("size", "full");
    form.append("type", "person");
    form.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": config.images.removeBgKey! }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`remove.bg ${res.status}: ${(await res.text()).slice(0, 300)}`);
    out = Buffer.from(await res.arrayBuffer());
  } else {
    const res = await fetch("https://fal.run/fal-ai/bria/background/remove", {
      method: "POST",
      headers: { Authorization: `Key ${config.images.falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: `data:image/jpeg;base64,${jpg.toString("base64")}` }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    const url = j?.image?.url;
    if (!url) throw new Error("fal returned no image");
    const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    out = Buffer.from(await img.arrayBuffer());
  }
  // Trim transparent margins so templates can size the figure precisely.
  return sharp(out).trim({ threshold: 1 }).png().toBuffer();
}
