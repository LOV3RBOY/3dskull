import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";
import { forbidden, unauthorized } from "./util/errors.js";
import { newId, nowIso } from "./util/ids.js";

export type Role = "admin" | "editor" | "viewer";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
}

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, role: r.role, createdAt: r.created_at });

// ---- password hashing (scrypt, no native deps) ----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const got = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

// ---- minimal HS256 JWT ----
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(user: User, ttlSeconds = 60 * 60 * 24 * 30): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub: user.id, role: user.role, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string): { sub: string; role: Role } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}

// ---- users ----
export function createUser(input: { email: string; name: string; password: string; role: Role }): User {
  const row: UserRow = {
    id: newId("usr"),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    password_hash: hashPassword(input.password),
    created_at: nowIso(),
  };
  db.prepare(
    "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (@id, @email, @name, @role, @password_hash, @created_at)",
  ).run(row);
  return toUser(row);
}

export function findUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
  const r = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  return r ? { ...toUser(r), passwordHash: r.password_hash } : undefined;
}

export function getUser(id: string): User | undefined {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return r ? toUser(r) : undefined;
}

export function listUsers(): User[] {
  return (db.prepare("SELECT * FROM users ORDER BY created_at").all() as UserRow[]).map(toUser);
}

export function deleteUser(id: string) {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function bootstrapAdmin() {
  const { email, password, name } = config.bootstrapAdmin;
  if (email && password && !findUserByEmail(email)) {
    createUser({ email, password, name, role: "admin" });
    console.log(`[auth] bootstrap admin created: ${email}`);
  }
}

// ---- fastify hooks ----
declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw unauthorized();
  const claims = verifyToken(h.slice(7));
  if (!claims) throw unauthorized("Session expired — please sign in again");
  const user = getUser(claims.sub);
  if (!user) throw unauthorized();
  req.user = user;
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
  };
}
