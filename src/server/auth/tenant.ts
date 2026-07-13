import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { roleRank, type Role, type TenantContext } from "@/server/auth/authorization";
import { prototypeSessionCookieName, verifyPrototypeSession } from "@/server/auth/password-session";

export type { Role, TenantContext } from "@/server/auth/authorization";

export async function requireTenantContext(minimumRole: Role = "viewer"): Promise<TenantContext> {
  const config = env();
  const session = (await cookies()).get(prototypeSessionCookieName)?.value;
  if (!verifyPrototypeSession(session, config.APP_PASSWORD)) {
    throw new AppError("authentication_required", "Sign in to continue.", 401);
  }
  const context: TenantContext = {
    organizationId: config.APP_ORGANIZATION_ID,
    userId: config.APP_USER_ID,
    role: config.APP_ROLE,
  };
  if (roleRank[context.role] < roleRank[minimumRole]) {
    throw new AppError("forbidden", "You do not have permission to perform this action.", 403);
  }
  return context;
}
