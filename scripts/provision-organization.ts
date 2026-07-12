import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import { memberships, organizations } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const input = z
  .object({
    DATABASE_DIRECT_URL: z.string().min(1),
    WORKOS_ORGANIZATION_ID: z.string().min(1),
    WORKOS_USER_ID: z.string().min(1),
    WORKOS_USER_EMAIL: z.email(),
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
const db = drizzle(client);
const [organization] = await db
  .insert(organizations)
  .values({
    workosOrganizationId: input.WORKOS_ORGANIZATION_ID,
    name: input.ORGANIZATION_NAME,
    slug: input.ORGANIZATION_SLUG,
    timezone: input.ORGANIZATION_TIMEZONE,
  })
  .onConflictDoUpdate({
    target: organizations.workosOrganizationId,
    set: {
      name: input.ORGANIZATION_NAME,
      timezone: input.ORGANIZATION_TIMEZONE,
      updatedAt: new Date(),
    },
  })
  .returning({ id: organizations.id });

if (!organization) throw new Error("Organization provisioning failed");

await db
  .insert(memberships)
  .values({
    organizationId: organization.id,
    workosUserId: input.WORKOS_USER_ID,
    email: input.WORKOS_USER_EMAIL,
    role: "owner",
  })
  .onConflictDoUpdate({
    target: [memberships.organizationId, memberships.workosUserId],
    set: { email: input.WORKOS_USER_EMAIL, role: "owner", updatedAt: new Date() },
  });

await client.end();
console.log(`Provisioned ${input.ORGANIZATION_NAME} as ${organization.id}`);
