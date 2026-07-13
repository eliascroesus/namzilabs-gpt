import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main(): Promise<void> {
  if (!process.env.DATABASE_DIRECT_URL) throw new Error("DATABASE_DIRECT_URL is required");

  const client = postgres(process.env.DATABASE_DIRECT_URL, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const cause =
    error instanceof Error && "cause" in error && error.cause instanceof Error
      ? error.cause
      : undefined;
  const code = cause && "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
  console.error(
    cause?.message ?? (error instanceof Error ? error.message : "Database migration failed"),
    code,
  );
  process.exitCode = 1;
});
