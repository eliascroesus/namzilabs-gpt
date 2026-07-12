import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { ProviderId } from "@/connectors/types";
import { AppError } from "@/lib/errors";
import { completeOAuth } from "@/server/oauth/callback";
import { openOAuthState } from "@/server/oauth/state";

export async function oauthCallback(
  request: Request,
  provider: Extract<ProviderId, "google-sheets" | "calendly" | "close">,
) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) throw new AppError("oauth_denied", `OAuth authorization failed: ${error}.`, 400);
  const code = url.searchParams.get("code");
  const suppliedState = url.searchParams.get("state");
  const store = await cookies();
  const sealed = store.get("namzi-oauth-state")?.value;
  if (!code || !suppliedState || !sealed)
    throw new AppError("invalid_oauth_callback", "OAuth callback is incomplete.", 400);
  const state = openOAuthState(sealed);
  if (state.state !== suppliedState)
    throw new AppError("invalid_oauth_state", "OAuth state is invalid.", 400);
  const connectionId = await completeOAuth(provider, code, state);
  store.delete("namzi-oauth-state");
  redirect(`/integrations/${connectionId}?connected=1`);
}
