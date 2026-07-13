import { z } from "zod";

const appEnvSchema = z.enum(["local", "preview", "production", "test"]);
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const environmentSchema = z.object({
  APP_ENV: appEnvSchema.default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: optionalNonEmptyString,
  DATABASE_DIRECT_URL: optionalNonEmptyString,
  ENCRYPTION_KEY_BASE64: optionalNonEmptyString,
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  ENCRYPTION_PREVIOUS_KEYS_JSON: z.string().default("{}"),
  APP_PASSWORD: optionalNonEmptyString,
  APP_ORGANIZATION_ID: z.uuid().default("00000000-0000-4000-8000-000000000001"),
  APP_USER_ID: z.string().min(1).default("prototype-admin"),
  APP_ROLE: z.enum(["owner", "admin", "editor", "viewer"]).default("owner"),
  INNGEST_EVENT_KEY: optionalNonEmptyString,
  INNGEST_SIGNING_KEY: optionalNonEmptyString,
  INNGEST_SERVE_ORIGIN: optionalUrl,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  GOOGLE_REDIRECT_URI: z.url().default("https://namzilabs.co/api/integrations/google/callback"),
  CALENDLY_CLIENT_ID: optionalNonEmptyString,
  CALENDLY_CLIENT_SECRET: optionalNonEmptyString,
  CALENDLY_WEBHOOK_SIGNING_KEY: optionalNonEmptyString,
  CLOSE_CLIENT_ID: optionalNonEmptyString,
  CLOSE_CLIENT_SECRET: optionalNonEmptyString,
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

let cached: AppEnvironment | undefined;

export function env(): AppEnvironment {
  cached ??= environmentSchema.parse(process.env);
  return cached;
}

export function assertProductionEnvironment(config = env()): void {
  if (config.APP_ENV !== "production") return;

  const required = [
    "DATABASE_URL",
    "ENCRYPTION_KEY_BASE64",
    "APP_PASSWORD",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "INNGEST_SERVE_ORIGIN",
    "NEXT_PUBLIC_SENTRY_DSN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ] as const;
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
  if (new URL(config.APP_URL).protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  if (config.APP_PASSWORD && config.APP_PASSWORD.length < 10) {
    throw new Error("APP_PASSWORD must contain at least 10 characters in production");
  }
  if (config.DATABASE_URL && !new URL(config.DATABASE_URL).hostname.includes("-pooler")) {
    throw new Error("DATABASE_URL must use the Neon pooled hostname in production");
  }
}

export function resetEnvForTests(): void {
  cached = undefined;
}
