import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_DIRECT_URL) {
  throw new Error("DATABASE_DIRECT_URL is required for migrations");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_DIRECT_URL },
  strict: true,
  verbose: true,
});
