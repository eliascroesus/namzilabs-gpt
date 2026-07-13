import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import { credential, defaultNormalizedRecord, subscriptionId } from "@/connectors/shared";
import type {
  BackfillPage,
  Connector,
  ConnectorContext,
  IncomingWebhook,
} from "@/connectors/types";
import { constantTimeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const driveFilesSchema = z.object({
  files: z
    .array(z.object({ id: z.string(), name: z.string(), modifiedTime: z.string().optional() }))
    .default([]),
});
const sheetsSchema = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).default([]),
});
const aboutSchema = z.object({
  user: z.object({ permissionId: z.string(), displayName: z.string().optional() }),
});
const pageTokenSchema = z.object({ startPageToken: z.string() });
const channelSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  expiration: z.string().optional(),
});

function accessToken(context: ConnectorContext): string {
  return credential(context, "accessToken");
}

function rowsToObjects(values: (string | number | boolean | null)[][]): Record<string, unknown>[] {
  const [headers, ...rows] = values;
  if (!headers) return [];
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? null])),
  );
}

export type SheetPagePlan = {
  headerRange: string;
  dataRange: string;
  dataStartRow: number;
  dataEndRow: number;
  nextCursorCandidate: string | null;
};

export function planSheetPage(
  configuredRange: string,
  cursor?: string,
  pageSize = 500,
): SheetPagePlan {
  const boundedPageSize = Math.min(1_000, Math.max(1, Math.trunc(pageSize)));
  const separator = configuredRange.lastIndexOf("!");
  const sheetPrefix = separator >= 0 ? configuredRange.slice(0, separator + 1) : "";
  const cells = (
    separator >= 0 ? configuredRange.slice(separator + 1) : configuredRange
  ).replaceAll("$", "");
  const match = /^([A-Za-z]+)(\d*):([A-Za-z]+)(\d*)$/.exec(cells.trim());
  if (!match) {
    throw new AppError(
      "invalid_sheet_range",
      "Use an A1 column range such as Leads!A:Z or Leads!A1:Z5000.",
      400,
    );
  }
  const [, startColumn, configuredStart, endColumn, configuredEnd] = match;
  const headerRow = configuredStart ? Number(configuredStart) : 1;
  const maximumRow = configuredEnd ? Number(configuredEnd) : Number.MAX_SAFE_INTEGER;
  const cursorRow = cursor ? Number(cursor) : headerRow + 1;
  if (
    !Number.isSafeInteger(headerRow) ||
    !Number.isSafeInteger(maximumRow) ||
    !Number.isSafeInteger(cursorRow) ||
    headerRow < 1 ||
    cursorRow <= headerRow ||
    maximumRow < headerRow
  ) {
    throw new AppError("invalid_sheet_cursor", "The Google Sheets cursor is invalid.", 400);
  }
  const dataEndRow = Math.min(maximumRow, cursorRow + boundedPageSize - 1);
  return {
    headerRange: `${sheetPrefix}${startColumn}${headerRow}:${endColumn}${headerRow}`,
    dataRange: `${sheetPrefix}${startColumn}${cursorRow}:${endColumn}${dataEndRow}`,
    dataStartRow: cursorRow,
    dataEndRow,
    nextCursorCandidate: dataEndRow < maximumRow ? String(dataEndRow + 1) : null,
  };
}

async function sheetValues(
  context: ConnectorContext,
  spreadsheetId: string,
  range: string,
): Promise<(string | number | boolean | null)[][]> {
  const response = await providerFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
    { headers: bearerHeaders(accessToken(context)) },
    sheetsSchema,
  );
  return response.values;
}

async function fetchSheetPage(
  context: ConnectorContext,
  cursor: string | undefined,
  pageSize: number,
): Promise<BackfillPage> {
  const spreadsheetId = String(context.configuration.spreadsheetId ?? "");
  const configuredRange = String(context.configuration.range ?? "A:Z");
  if (!spreadsheetId) {
    throw new AppError("spreadsheet_required", "Select a Google spreadsheet first.", 400);
  }
  const plan = planSheetPage(configuredRange, cursor, pageSize);
  const [headerValues, dataValues] = await Promise.all([
    sheetValues(context, spreadsheetId, plan.headerRange),
    sheetValues(context, spreadsheetId, plan.dataRange),
  ]);
  const headers = headerValues[0];
  if (!headers) return { records: [], nextCursor: null, highWatermark: new Date().toISOString() };
  const records = rowsToObjects([headers, ...dataValues]);
  const requestedRows = plan.dataEndRow - plan.dataStartRow + 1;
  const nextCursor = dataValues.length < requestedRows ? null : plan.nextCursorCandidate;
  return { records, nextCursor, highWatermark: new Date().toISOString() };
}

async function startPageToken(context: ConnectorContext): Promise<string> {
  const response = await providerFetch(
    "https://www.googleapis.com/drive/v3/changes/startPageToken",
    { headers: bearerHeaders(accessToken(context)) },
    pageTokenSchema,
  );
  return response.startPageToken;
}

export const googleSheetsConnector: Connector = {
  manifest: {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Track selected spreadsheets with per-file Google access.",
    logo: "GS",
    authType: "oauth2",
    apiVersion: "drive-v3/sheets-v4",
    mappingVersion: 1,
    resources: ["spreadsheet", "sheet", "row"],
    events: ["row.created", "row.updated", "row.deleted", "spreadsheet.changed"],
    capabilities: ["oauth", "webhooks", "polling", "backfill", "sample", "subscription-renewal"],
  },

  async authorize(context) {
    const state = credential(context, "oauthState");
    const config = env();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: config.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    }).toString();
    return { kind: "redirect", url: url.toString(), state };
  },

  async validateCredentials(context) {
    const about = await providerFetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName)",
      { headers: bearerHeaders(accessToken(context)) },
      aboutSchema,
    );
    return {
      kind: "validated",
      externalAccountId: about.user.permissionId,
      externalAccountName: about.user.displayName,
    };
  },

  async discoverResources(context) {
    const result = await providerFetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fvnd.google-apps.spreadsheet'%20and%20trashed%3Dfalse&fields=files(id,name,modifiedTime)&pageSize=100",
      { headers: bearerHeaders(accessToken(context)) },
      driveFilesSchema,
    );
    return result.files.map((file) => ({
      type: "spreadsheet",
      externalId: file.id,
      name: file.name,
      metadata: { modifiedTime: file.modifiedTime },
    }));
  },

  async fetchSample(context, limit) {
    const page = await fetchSheetPage(context, undefined, limit);
    return page.records.slice(0, limit);
  },

  async startBackfill(context, cursor) {
    const requestedPageSize = Number(context.configuration.pageSize ?? 500);
    const pageSize = Number.isFinite(requestedPageSize) ? requestedPageSize : 500;
    return fetchSheetPage(context, cursor, pageSize);
  },

  async continueBackfill(context, cursor) {
    return this.startBackfill(context, cursor);
  },

  async createSubscription(context) {
    const pageToken = String(context.configuration.pageToken ?? (await startPageToken(context)));
    const id = subscriptionId();
    const channelToken = credential(context, "webhookSecret");
    const expiresAt = Date.now() + 6.5 * 24 * 60 * 60 * 1_000;
    const channel = await providerFetch(
      `https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(pageToken)}`,
      {
        method: "POST",
        headers: { ...bearerHeaders(accessToken(context)), "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          type: "web_hook",
          address: context.callbackUrl,
          token: channelToken,
          expiration: String(expiresAt),
        }),
      },
      channelSchema,
    );
    return {
      externalId: channel.id,
      resourceId: channel.resourceId,
      expiresAt: channel.expiration
        ? new Date(Number(channel.expiration)).toISOString()
        : undefined,
      metadata: { pageToken },
    };
  },

  async renewSubscription(context) {
    return this.createSubscription(context);
  },

  async deleteSubscription(context, subscription) {
    if (!subscription.externalId || !subscription.resourceId) return;
    await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
      method: "POST",
      headers: { ...bearerHeaders(accessToken(context)), "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscription.externalId, resourceId: subscription.resourceId }),
    });
  },

  async verifyWebhook(context, webhook: IncomingWebhook) {
    const supplied = webhook.headers.get("x-goog-channel-token");
    const expected = context.credentials.webhookSecret;
    return Boolean(supplied && expected && constantTimeEqual(supplied, expected));
  },

  async parseWebhook(_context, webhook) {
    const channel = webhook.headers.get("x-goog-channel-id") ?? "unknown";
    const message = webhook.headers.get("x-goog-message-number") ?? "unknown";
    return [
      {
        providerEventId: `${channel}:${message}`,
        eventType: "spreadsheet.changed",
        eventAt: new Date().toISOString(),
        payload: {
          channelId: channel,
          resourceId: webhook.headers.get("x-goog-resource-id"),
          resourceState: webhook.headers.get("x-goog-resource-state"),
          messageNumber: message,
        },
      },
    ];
  },

  async normalizeRecord(context, record, eventType) {
    const keyColumn = context.configuration.uniqueKeyColumn;
    const mode = context.configuration.syncMode;
    const key = typeof keyColumn === "string" ? record[keyColumn] : undefined;
    if (mode !== "append-only" && (key === null || key === undefined || key === "")) {
      throw new Error("A unique key column is required for mutable Google Sheet rows.");
    }
    const normalized = defaultNormalizedRecord(record, "row", eventType);
    return {
      ...normalized,
      externalId: key === undefined ? sha256(JSON.stringify(record)) : String(key),
    };
  },

  async healthCheck(context) {
    await this.validateCredentials(context);
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Google account reachable",
      freshness: "live",
    };
  },

  async revokeCredentials(context) {
    const token = context.credentials.refreshToken ?? context.credentials.accessToken;
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    }
  },
};
