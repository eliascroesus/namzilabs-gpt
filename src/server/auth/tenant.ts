import { withAuth } from "@workos-inc/authkit-nextjs";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { roleRank, roles, type Role, type TenantContext } from "@/server/auth/authorization";

export type { Role, TenantContext } from "@/server/auth/authorization";

export async function requireTenantContext(minimumRole: Role = "viewer"): Promise<TenantContext> {
  const config = env();
  let context: TenantContext;

  if (config.WORKOS_API_KEY && config.WORKOS_CLIENT_ID) {
    const session = await withAuth({ ensureSignedIn: true });
    if (!session.organizationId || !session.role || !roles.includes(session.role as Role)) {
      throw new AppError("organization_required", "Select an organization to continue.", 403);
    }
    const [organization] = await getDb()
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.workosOrganizationId, session.organizationId))
      .limit(1);
    if (!organization) {
      throw new AppError(
        "organization_not_provisioned",
        "This WorkOS organization has not been provisioned in the application.",
        403,
      );
    }
    context = {
      organizationId: organization.id,
      userId: session.user.id,
      role: session.role as Role,
    };
  } else {
    if (config.APP_ENV === "production") {
      throw new AppError("auth_not_configured", "Authentication is not configured.", 503);
    }
    context = {
      organizationId: config.DEV_ORGANIZATION_ID,
      userId: config.DEV_USER_ID,
      role: config.DEV_ROLE,
    };
  }

  if (roleRank[context.role] < roleRank[minimumRole]) {
    throw new AppError("forbidden", "You do not have permission to perform this action.", 403);
  }
  return context;
}
