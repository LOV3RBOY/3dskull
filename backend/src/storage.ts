import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { badRequest } from "./util/errors.js";

fs.mkdirSync(config.storageDir, { recursive: true });

const KEY_RE = /^[a-z0-9_-]+\/[a-z0-9_.-]+$/i;

export function filePath(key: string): string {
  if (!KEY_RE.test(key)) throw badRequest("Invalid file key");
  const p = path.join(config.storageDir, key);
  const rel = path.relative(config.storageDir, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw badRequest("Invalid file key");
  return p;
}

export async function putFile(key: string, data: Buffer): Promise<string> {
  const p = filePath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, data);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.promises.readFile(filePath(key));
}

export async function deleteFile(key: string | null | undefined) {
  if (!key) return;
  await fs.promises.rm(filePath(key), { force: true });
}

export async function makeThumb(data: Buffer, maxSize = 640): Promise<Buffer> {
  return sharp(data, { failOn: "none" })
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

function sign(key: string, exp: number) {
  return crypto.createHmac("sha256", config.jwtSecret).update(`${key}:${exp}`).digest("base64url");
}

export function verifySignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(key, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

let requestOrigin: string | undefined;
/** Remember the origin of the most recent request when PUBLIC_BASE_URL isn't configured. */
export function noteOrigin(origin: string) {
  requestOrigin = origin;
}

export function signedUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  // Round expiry to the hour so URLs are stable (iOS image caches stay warm).
  const ttl = config.fileUrlTtlSeconds;
  const exp = Math.ceil((Math.floor(Date.now() / 1000) + ttl) / 3600) * 3600;
  const base = config.publicBaseUrl ?? requestOrigin ?? `http://localhost:${config.port}`;
  return `${base.replace(/\/$/, "")}/files/${key}?exp=${exp}&sig=${sign(key, exp)}`;
}

export function mimeFor(key: string): string {
  const ext = path.extname(key).toLowerCase();
  return (
    { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".woff2": "font/woff2", ".otf": "font/otf", ".ttf": "font/ttf" }[
      ext
    ] ?? "application/octet-stream"
  );
}
