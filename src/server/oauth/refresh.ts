import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { providerFetch } from "@/connectors/http";
import type { Database } from "@/db/client";
import { connections, encryptedCredentials } from "@/db/schema";
import { env } from "@/lib/env";
import { loadCredentials, storeCredential } from "@/server/credentials/service";

const refreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

export type OAuthProvider = "google-sheets" | "calendly" | "close";

export function buildRefreshRequest(provider: OAuthProvider, refreshToken: string) {
  const config = env();
  if (provider === "google-sheets") {
    return {
      url: "https://oauth2.googleapis.com/token",
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID ?? "",
        client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    };
  }
  if (provider === "calendly") {
    return {
      url: "https://auth.calendly.com/oauth/token",
      body: new URLSearchParams({
        client_id: config.CALENDLY_CLIENT_ID ?? "",
        client_secret: config.CALENDLY_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    };
  }
  return {
    url: "https://api.close.com/oauth2/token/",
    body: new URLSearchParams({
      client_id: config.CLOSE_CLIENT_ID ?? "",
      client_secret: config.CLOSE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  };
}

export async function ensureFreshAccessToken(
  db: Database,
  connection: typeof connections.$inferSelect,
): Promise<void> {
  if (!(["google-sheets", "calendly", "close"] as string[]).includes(connection.provider)) return;
  const [accessMetadata] = await db
    .select({ expiresAt: encryptedCredentials.expiresAt })
    .from(encryptedCredentials)
    .where(
      and(
        eq(encryptedCredentials.organizationId, connection.organizationId),
        eq(encryptedCredentials.connectionId, connection.id),
        eq(encryptedCredentials.credentialType, "accessToken"),
      ),
    )
    .limit(1);
  if (!accessMetadata?.expiresAt || accessMetadata.expiresAt.getTime() > Date.now() + 60_000)
    return;

  const credentials = await loadCredentials(db, connection.organizationId, connection.id);
  const refreshToken = credentials.refreshToken;
  if (!refreshToken) return;
  const request = buildRefreshRequest(connection.provider as OAuthProvider, refreshToken);
  const response = await providerFetch(
    request.url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: request.body,
    },
    refreshResponseSchema,
    3,
  );
  await storeCredential(db, {
    organizationId: connection.organizationId,
    connectionId: connection.id,
    type: "accessToken",
    value: response.access_token,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1_000) : undefined,
  });
  if (response.refresh_token) {
    // Close and some other providers rotate this value. Replacing it in the same
    // encrypted row makes the superseded token unreachable immediately.
    await storeCredential(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      type: "refreshToken",
      value: response.refresh_token,
    });
  }
}
