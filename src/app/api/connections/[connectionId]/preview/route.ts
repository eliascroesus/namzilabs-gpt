import { z } from "zod";

import { previewGoogleSheet } from "@/connectors/providers/google-sheets";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { AppError, errorResponse, requestIdFrom } from "@/lib/errors";
import { requireTenantContext } from "@/server/auth/tenant";
import { connectorContext, getConnectionForOrganization } from "@/server/connections/service";

const schema = z.object({
  spreadsheetId: z.string().min(10).max(200),
  sheetName: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(10).default(3),
  filters: z
    .array(
      z.object({
        field: z.string().min(1).max(200),
        operator: z.enum([
          "equals",
          "not_equals",
          "contains",
          "not_contains",
          "starts_with",
          "ends_with",
          "greater_than",
          "less_than",
          "is_empty",
          "is_not_empty",
        ]),
        value: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .max(20)
    .default([]),
  calculation: z
    .object({
      operation: z.enum(["count", "distinct_count", "sum", "average"]),
      field: z.string().min(1).max(200).optional(),
    })
    .default({ operation: "count" }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const tenant = await requireTenantContext("editor");
    const { connectionId } = await params;
    const input = schema.parse(await request.json());
    const db = getDb();
    const connection = await getConnectionForOrganization(db, tenant.organizationId, connectionId);
    if (connection.provider !== "google-sheets") {
      throw new AppError(
        "live_preview_not_supported",
        "Live source preview is not available for this provider yet.",
        400,
      );
    }
    const context = await connectorContext(
      db,
      connection,
      `${env().APP_URL}/api/webhooks/${connection.id}`,
    );
    const data = await previewGoogleSheet(context, input);
    return Response.json(
      { data, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
