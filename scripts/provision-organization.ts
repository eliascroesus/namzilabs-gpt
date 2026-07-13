import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import { organizations } from "../src/db/schema";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main(): Promise<void> {
  const input = z
    .object({
      DATABASE_DIRECT_URL: z.string().min(1),
      APP_ORGANIZATION_ID: z.uuid(),
      ORGANIZATION_NAME: z.string().min(1).default("Namzi Labs"),
      ORGANIZATION_SLUG: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .default("namzi-labs"),
      ORGANIZATION_TIMEZONE: z.string().default("Europe/Stockholm"),
    })
    .parse(process.env);

  new Intl.DateTimeFormat("en", { timeZone: input.ORGANIZATION_TIMEZONE }).format();
  const client = postgres(input.DATABASE_DIRECT_URL, { max: 1 });
  try {
    const db = drizzle(client);
    const [organization] = await db
      .insert(organizations)
      .values({
        id: input.APP_ORGANIZATION_ID,
        name: input.ORGANIZATION_NAME,
        slug: input.ORGANIZATION_SLUG,
        timezone: input.ORGANIZATION_TIMEZONE,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: {
          name: input.ORGANIZATION_NAME,
          slug: input.ORGANIZATION_SLUG,
          timezone: input.ORGANIZATION_TIMEZONE,
          updatedAt: new Date(),
        },
      })
      .returning({ id: organizations.id });
    if (!organization) throw new Error("Organization provisioning failed");
    console.log(`Provisioned ${input.ORGANIZATION_NAME} as ${organization.id}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Organization provisioning failed");
  process.exitCode = 1;
});
