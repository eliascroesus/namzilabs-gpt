import { z } from "zod";

const appEnvSchema = z.enum(["local", "preview", "production", "test"]);

const environmentSchema = z.object({
  APP_ENV: appEnvSchema.default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_DIRECT_URL: z.string().min(1).optional(),
  ENCRYPTION_KEY_BASE64: z.string().min(1).optional(),
  WORKOS_API_KEY: z.string().min(1).optional(),
  WORKOS_CLIENT_ID: z.string().min(1).optional(),
  WORKOS_COOKIE_PASSWORD: z.string().min(1).optional(),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url().optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().default("https://namzilabs.co/api/integrations/google/callback"),
  CALENDLY_CLIENT_ID: z.string().min(1).optional(),
  CALENDLY_CLIENT_SECRET: z.string().min(1).optional(),
  CALENDLY_WEBHOOK_SIGNING_KEY: z.string().min(1).optional(),
  CLOSE_CLIENT_ID: z.string().min(1).optional(),
  CLOSE_CLIENT_SECRET: z.string().min(1).optional(),
  DEV_USER_ID: z.string().default("user_local"),
  DEV_ORGANIZATION_ID: z.uuid().default("00000000-0000-4000-8000-000000000001"),
  DEV_ROLE: z.enum(["owner", "admin", "editor", "viewer"]).default("owner"),
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
    "WORKOS_API_KEY",
    "WORKOS_CLIENT_ID",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
  ] as const;
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
}

export function resetEnvForTests(): void {
  cached = undefined;
}
