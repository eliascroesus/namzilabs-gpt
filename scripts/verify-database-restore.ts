import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const requiredTables = [
  "organizations",
  "connections",
  "raw_events",
  "outbox_events",
  "source_records",
  "activity_facts",
  "audit_logs",
  "operational_measurements",
] as const;

async function main(): Promise<void> {
  const url = process.env.RESTORE_DATABASE_URL;
  if (!url) throw new Error("RESTORE_DATABASE_URL is required; never point it at production");
  if (url === process.env.DATABASE_URL || url === process.env.DATABASE_DIRECT_URL) {
    throw new Error("RESTORE_DATABASE_URL must be an isolated restore-test branch");
  }

  const client = postgres(url, { max: 1, prepare: false });
  try {
    const tables = await client<{ name: string | null }[]>`
      SELECT to_regclass(requested.name)::text AS name
      FROM unnest(${client.array([...requiredTables], 25)}::text[]) AS requested(name)
    `;
    const missing = requiredTables.filter((table) => !tables.some((row) => row.name === table));
    if (missing.length > 0) throw new Error(`Restore is missing tables: ${missing.join(", ")}`);

    const [counts] = await client<
      {
        organizations: number;
        connections: number;
        raw_events: number;
        source_records: number;
        activity_facts: number;
        pending_events: number;
      }[]
    >`
      SELECT
        (SELECT COUNT(*)::int FROM organizations) AS organizations,
        (SELECT COUNT(*)::int FROM connections) AS connections,
        (SELECT COUNT(*)::int FROM raw_events) AS raw_events,
        (SELECT COUNT(*)::int FROM source_records) AS source_records,
        (SELECT COUNT(*)::int FROM activity_facts) AS activity_facts,
        (SELECT COUNT(*)::int FROM raw_events WHERE status = 'pending') AS pending_events
    `;
    console.log(JSON.stringify({ verified: true, counts }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Restore verification failed");
  process.exitCode = 1;
});
