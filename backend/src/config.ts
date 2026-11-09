import path from "node:path";

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function required(name: string, fallback?: string): string {
  const v = env(name, fallback);
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const dataDir = path.resolve(env("DATA_DIR", "./data")!);

export const config = {
  port: Number(env("PORT", "8787")),
  host: env("HOST", "0.0.0.0")!,
  /** Public origin used to build absolute signed file URLs, e.g. https://studio.example.com */
  publicBaseUrl: env("PUBLIC_BASE_URL"),
  dataDir,
  dbPath: path.join(dataDir, "studio.db"),
  storageDir: path.join(dataDir, "files"),
  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-only-insecure-secret-change-me"),
  fileUrlTtlSeconds: Number(env("FILE_URL_TTL_SECONDS", String(60 * 60 * 24 * 7))),
  timezone: env("XS_TIMEZONE", "America/Los_Angeles")!,

  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY"),
    /** Creative director / agent model. */
    model: env("ANTHROPIC_MODEL", "claude-opus-5-5")!,
    effort: (env("ANTHROPIC_EFFORT", "high") as "low" | "medium" | "high" | "xhigh" | "max"),
    maxAgentTurns: Number(env("AGENT_MAX_TURNS", "24")),
  },

  images: {
    /** auto | openai | gemini | bfl | none — "auto" picks the first configured key in that order: gemini, bfl, openai */
    provider: env("IMAGE_PROVIDER", "auto")!,
    openaiApiKey: env("OPENAI_API_KEY"),
    openaiModel: env("OPENAI_IMAGE_MODEL", "gpt-image-2.6-sunburst")!,
    geminiApiKey: env("GEMINI_API_KEY"),
    geminiModel: env("GEMINI_IMAGE_MODEL", "gemini-nano-banana-2.1")!,
    bflApiKey: env("BFL_API_KEY"),
    bflModel: env("BFL_MODEL", "flux-2-pro")!,
    /** auto | photoroom | removebg | fal | none */
    cutoutProvider: env("CUTOUT_PROVIDER", "auto")!,
    photoroomKey: env("PHOTOROOM_API_KEY"),
    removeBgKey: env("REMOVE_BG_API_KEY"),
    falKey: env("FAL_KEY"),
  },

  render: {
    chromiumPath: env("CHROMIUM_PATH"),
    concurrency: Number(env("RENDER_CONCURRENCY", "2")),
  },

  bootstrapAdmin: {
    email: env("ADMIN_EMAIL"),
    password: env("ADMIN_PASSWORD"),
    name: env("ADMIN_NAME", "Admin")!,
  },
};

export type Config = typeof config;
