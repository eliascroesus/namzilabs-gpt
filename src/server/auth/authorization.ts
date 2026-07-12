import { AppError } from "@/lib/errors";

export const roles = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof roles)[number];

export type TenantContext = {
  organizationId: string;
  userId: string;
  role: Role;
};

export const roleRank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function assertOrganization(context: TenantContext, organizationId: string): void {
  if (context.organizationId !== organizationId) {
    throw new AppError("not_found", "The requested resource was not found.", 404);
  }
}
