import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const OPENAI_MODEL = "gpt-5.5";
const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const MOONSHOT_MODEL = "kimi-k2.6";
const forbiddenPublicProviderKeyEnvVars = [
  "NEXT_PUBLIC_OPENAI_API_KEY",
  "NEXT_PUBLIC_OPENAI_KEY",
  "NEXT_PUBLIC_OPENAI_TOKEN",
  "VITE_OPENAI_API_KEY",
  "VITE_OPENAI_KEY",
  "VITE_OPENAI_TOKEN",
  "NEXT_PUBLIC_MOONSHOT_API_KEY",
  "NEXT_PUBLIC_MOONSHOT_KEY",
  "NEXT_PUBLIC_MOONSHOT_TOKEN",
  "VITE_MOONSHOT_API_KEY",
  "VITE_MOONSHOT_KEY",
  "VITE_MOONSHOT_TOKEN",
  "NEXT_PUBLIC_SEEDANCE_API_KEY",
  "NEXT_PUBLIC_SEEDANCE_KEY",
  "NEXT_PUBLIC_SEEDANCE_TOKEN",
  "VITE_SEEDANCE_API_KEY",
  "VITE_SEEDANCE_KEY",
  "VITE_SEEDANCE_TOKEN"
] as const;

loadEnvFiles();
assertProviderKeysAreServerOnly();

const optionalSecret = z.preprocess((value) => {
  return typeof value === "string" && !hasSecretValue(value) ? undefined : value;
}, z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  APP_ENV: z.enum(["local", "development", "production"]).default("development"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default("127.0.0.1"),
  WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  APP_PUBLIC_URL: optionalUrl,
  MOCK_PROVIDERS: z.enum(["true", "false"]).default("false"),
  DATABASE_URL: optionalSecret,

  OPENAI_MOCK: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_API_MODE: z.enum(["responses", "chat"]).default("responses"),
  OPENAI_MODEL: z.string().min(1).default(OPENAI_MODEL),

  MOONSHOT_API_KEY: optionalSecret,
  MOONSHOT_BASE_URL: z.string().url().default(MOONSHOT_BASE_URL),
  MOONSHOT_MODEL: z.string().min(1).default(MOONSHOT_MODEL),

  OPENAI_MAX_COMPLETION_TOKENS: z.coerce.number().int().positive().default(32000),
  OPENAI_TEXT_TIMEOUT_MS: z.coerce.number().int().positive().default(360000),
  OPENAI_FALLBACK_TO_MOCK_ON_TIMEOUT: z.enum(["true", "false"]).default("true"),

  SEEDANCE_MOCK: z.enum(["true", "false"]).default("false"),
  SEEDANCE_API_KEY: optionalSecret,
  SEEDANCE_PROVIDER: z.enum(["ark", "fal", "generic"]).default("ark"),
  SEEDANCE_BASE_URL: z.string().url().default("https://ark.cn-beijing.volces.com/api/v3"),
  SEEDANCE_AUTH_SCHEME: z.string().min(1).default("Bearer"),
  SEEDANCE_IMAGE_MODEL: z.string().min(1).default("doubao-seedream-4-0-250828"),
  SEEDANCE_IMAGE_SIZE: z.string().min(1).default("1728x2304"),
  SEEDANCE_IMAGE_ENHANCE_MODE: z.string().min(1).default("standard"),
  SEEDANCE_VIDEO_MODEL: z.string().min(1).default("doubao-seedance-2-0-260128"),
  SEEDANCE_VIDEO_RESOLUTION: z.string().min(1).default("720p"),
  SEEDANCE_GENERATE_AUDIO: z.enum(["true", "false"]).default("true"),
  SEEDANCE_HTTP_TIMEOUT_SEC: z.coerce.number().int().positive().default(120),
  SEEDANCE_VIDEO_SYNC_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  SEEDANCE_VIDEO_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: optionalSecret,
  STORAGE_REGION: optionalSecret,
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_PREFIX: z.string().optional().default("media"),
  STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  STORAGE_ACCESS_KEY_ID: optionalSecret,
  STORAGE_SECRET_ACCESS_KEY: optionalSecret
});

export const env = envSchema.parse(process.env);
export type ServerEnv = typeof env;

export function findPublicProviderKeyEnvVars(source: Record<string, string | undefined> = process.env): string[] {
  return forbiddenPublicProviderKeyEnvVars.filter((key) => hasSecretValue(source[key]));
}

export const findPublicOpenAIKeyEnvVars = findPublicProviderKeyEnvVars;

function assertProviderKeysAreServerOnly() {
  const publicProviderKeyEnvVars = findPublicProviderKeyEnvVars();
  if (publicProviderKeyEnvVars.length === 0) return;

  throw new Error(
    `Provider API keys must stay server-side. Remove ${publicProviderKeyEnvVars.join(
      ", "
    )} and configure the corresponding server-only API key variable instead.`
  );
}

function hasSecretValue(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "none" && normalized !== "null" && normalized !== "undefined";
}

function loadEnvFiles() {
  const originalKeys = new Set(Object.keys(process.env));
  loadEnvFile(".env", originalKeys);

  const appEnv = normalizeAppEnv(process.env.APP_ENV || process.env.NODE_ENV || "development");
  const candidates = [`.env.${appEnv}`];
  if (appEnv !== "production") candidates.push(".env.local");
  candidates.push(`.env.${appEnv}.local`);

  for (const file of Array.from(new Set(candidates))) {
    loadEnvFile(file, originalKeys);
  }
}

function loadEnvFile(file: string, originalKeys: Set<string>) {
  const absolutePath = resolve(process.cwd(), file);
  if (!existsSync(absolutePath)) return;
  const parsed = dotenv.parse(readFileSync(absolutePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (originalKeys.has(key)) continue;
    process.env[key] = value;
  }
}

function normalizeAppEnv(value: string): "local" | "development" | "production" {
  if (value === "production") return "production";
  if (value === "local") return "local";
  return "development";
}
