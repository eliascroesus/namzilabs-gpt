import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getConnector } from "@/connectors/registry";
import type { ProviderId } from "@/connectors/types";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { connectorContext, getConnectionForOrganization } from "@/server/connections/service";
import { requireTenantContext } from "@/server/auth/tenant";
import { createOAuthState, pkceChallenge, sealOAuthState } from "@/server/oauth/state";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const tenant = await requireTenantContext("editor");
  const provider = (await params).provider as ProviderId;
  if (!(["google-sheets", "calendly", "close"] as string[]).includes(provider)) {
    throw new AppError("oauth_not_supported", "This connector does not use OAuth.", 400);
  }
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) throw new AppError("connection_required", "Connection ID is required.", 400);
  const db = getDb();
  const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
  const state = createOAuthState(
    provider as "google-sheets" | "calendly" | "close",
    tenant.organizationId,
    connectionId,
  );
  const context = await connectorContext(
    db,
    connection,
    `${env().APP_URL}/api/webhooks/${connection.id}`,
    { refreshAccessToken: false },
  );
  context.credentials.oauthState = state.state;
  context.credentials.pkceChallenge = pkceChallenge(state.verifier);
  const result = await getConnector(provider).authorize(context);
  if (result.kind !== "redirect")
    throw new AppError("oauth_not_supported", "Connector did not return an OAuth redirect.", 400);
  (await cookies()).set("namzi-oauth-state", sealOAuthState(state), {
    httpOnly: true,
    secure: env().APP_ENV !== "local",
    sameSite: "lax",
    path: "/api/integrations",
    maxAge: 600,
  });
  redirect(result.url);
}
