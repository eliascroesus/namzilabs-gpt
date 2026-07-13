import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main(): Promise<void> {
  if (!process.env.DATABASE_DIRECT_URL) throw new Error("DATABASE_DIRECT_URL is required");
  if (!process.env.ENCRYPTION_KEY_BASE64) throw new Error("ENCRYPTION_KEY_BASE64 is required");

  const client = postgres(process.env.DATABASE_DIRECT_URL, { max: 1 });
  try {
    const { rotateStoredCredentials } = await import("../src/server/credentials/service");
    const rotated = await rotateStoredCredentials(drizzle(client));
    console.log(`Rotated ${rotated} encrypted credential rows.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Credential rotation failed");
  process.exitCode = 1;
});
