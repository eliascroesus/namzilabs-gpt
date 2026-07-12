import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

type Database = PostgresJsDatabase<typeof schema>;
let database: Database | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;

export function getDb(): Database {
  if (database) return database;
  const url = env().DATABASE_URL;
  if (!url) throw new AppError("database_not_configured", "The database is not configured.", 503);
  sqlClient = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  database = drizzle(sqlClient, { schema });
  return database;
}

export function getSqlClient(): ReturnType<typeof postgres> {
  getDb();
  if (!sqlClient)
    throw new AppError("database_not_configured", "The database is not configured.", 503);
  return sqlClient;
}

export type { Database };
