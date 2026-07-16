import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ProviderId } from "@/connectors/types";
import { getConnector } from "@/connectors/registry";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { providerFetch } from "@/connectors/http";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { connectorContext, getConnectionForOrganization } from "@/server/connections/service";
import { provisionConnectedAccount } from "@/server/connections/provision";
import { storeCredential } from "@/server/credentials/service";
import type { OAuthState } from "@/server/oauth/state";

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

type OAuthProvider = Extract<
  ProviderId,
  "google-sheets" | "google-calendar" | "calendly" | "cal-com" | "close"
>;

function tokenRequest(provider: OAuthProvider, code: string, state: OAuthState) {
  const config = env();
  if (provider === "google-sheets" || provider === "google-calendar") {
    return {
      url: "https://oauth2.googleapis.com/token",
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID ?? "",
        client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
        code,
        code_verifier: state.verifier,
        redirect_uri:
          provider === "google-sheets"
            ? config.GOOGLE_REDIRECT_URI
            : `${config.APP_URL}/api/integrations/google-calendar/callback`,
        grant_type: "authorization_code",
      }),
    };
  }
  if (provider === "calendly") {
    return {
      url: "https://auth.calendly.com/oauth/token",
      body: new URLSearchParams({
        client_id: config.CALENDLY_CLIENT_ID ?? "",
        client_secret: config.CALENDLY_CLIENT_SECRET ?? "",
        code,
        code_verifier: state.verifier,
        redirect_uri: `${config.APP_URL}/api/integrations/calendly/callback`,
        grant_type: "authorization_code",
      }),
    };
  }
  if (provider === "cal-com") {
    return {
      url: "https://api.cal.com/v2/auth/oauth2/token",
      body: new URLSearchParams({
        client_id: config.CALCOM_CLIENT_ID ?? "",
        client_secret: config.CALCOM_CLIENT_SECRET ?? "",
        code,
        redirect_uri: `${config.APP_URL}/api/integrations/cal-com/callback`,
        grant_type: "authorization_code",
      }),
    };
  }
  return {
    url: "https://api.close.com/oauth2/token/",
    body: new URLSearchParams({
      client_id: config.CLOSE_CLIENT_ID ?? "",
      client_secret: config.CLOSE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
    }),
  };
}

export async function completeOAuth(
  provider: OAuthProvider,
  code: string,
  state: OAuthState,
): Promise<string> {
  if (state.provider !== provider)
    throw new AppError("oauth_provider_mismatch", "OAuth provider mismatch.", 400);
  const db = getDb();
  const connection = await getConnectionForOrganization(
    db,
    state.organizationId,
    state.connectionId,
  );
  const request = tokenRequest(provider, code, state);
  const token = await providerFetch(
    request.url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: request.body,
    },
    tokenSchema,
    2,
  );
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1_000) : undefined;
  await storeCredential(db, {
    organizationId: state.organizationId,
    connectionId: state.connectionId,
    type: "accessToken",
    value: token.access_token,
    expiresAt,
  });
  if (token.refresh_token) {
    await storeCredential(db, {
      organizationId: state.organizationId,
      connectionId: state.connectionId,
      type: "refreshToken",
      value: token.refresh_token,
    });
  }
  const context = await connectorContext(
    db,
    connection,
    `${env().APP_URL}/api/webhooks/${connection.id}`,
  );
  const identity = await getConnector(provider).validateCredentials(context);
  if (identity.kind !== "validated")
    throw new AppError("oauth_validation_failed", "OAuth validation failed.", 502);
  await db
    .update(connections)
    .set({
      externalAccountId: identity.externalAccountId,
      externalAccountName: identity.externalAccountName,
      status: "active",
      freshness: "unknown",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(connections.id, connection.id));
  await provisionConnectedAccount(db, connection, `${env().APP_URL}/api/webhooks/${connection.id}`);
  return connection.id;
}
