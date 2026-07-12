import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_DIRECT_URL) throw new Error("DATABASE_DIRECT_URL is required");

const client = postgres(process.env.DATABASE_DIRECT_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
