import { z } from "zod";

import { bearerHeaders, providerFetch } from "@/connectors/http";
import { inferFields, type InferredField } from "@/connectors/schema-inference";
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
  nextPageToken: z.string().optional(),
  files: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        modifiedTime: z.string().optional(),
        webViewLink: z.string().optional(),
      }),
    )
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
const spreadsheetMetadataSchema = z.object({
  properties: z.object({
    title: z.string(),
    timeZone: z.string().optional(),
  }),
  sheets: z
    .array(
      z.object({
        properties: z.object({
          sheetId: z.number().int(),
          title: z.string(),
          index: z.number().int(),
          hidden: z.boolean().optional(),
          sheetType: z.string().optional(),
          gridProperties: z
            .object({ rowCount: z.number().int(), columnCount: z.number().int() })
            .optional(),
        }),
      }),
    )
    .default([]),
});

export type GoogleSpreadsheet = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
};

export type GoogleSheetTab = {
  id: number;
  name: string;
  index: number;
  hidden: boolean;
  rowCapacity: number;
  columnCount: number;
};

export type GooglePreviewFilter = {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value?: string | number;
};

export type GoogleSheetPreview = {
  records: Record<string, unknown>[];
  fields: InferredField[];
  fieldValues: Record<string, (string | number | boolean)[]>;
  totalRecords: number;
  matchingRecords: number;
  metricValue: number;
  refreshedAt: string;
};

function accessToken(context: ConnectorContext): string {
  return credential(context, "accessToken");
}

export function rowsToObjects(
  values: (string | number | boolean | null)[][],
  firstDataRow = 2,
): Record<string, unknown>[] {
  const [headers, ...rows] = values;
  if (!headers) return [];
  const seen = new Map<string, number>();
  const normalizedHeaders = headers.map((header, index) => {
    const base = String(header ?? "").trim() || `Column ${index + 1}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence === 1 ? base : `${base} (${occurrence})`;
  });
  return rows
    .map((row, rowIndex): Record<string, unknown> => ({
      ...Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? null])),
      __namzi_row_number: firstDataRow + rowIndex,
    }))
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "__namzi_row_number" && value !== null && value !== "",
      ),
    );
}

function quotedSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

export function columnName(columnCount: number): string {
  let value = Math.max(1, Math.trunc(columnCount));
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function previewFilterPasses(
  record: Record<string, unknown>,
  filter: GooglePreviewFilter,
): boolean {
  const current = record[filter.field];
  const empty = current === null || current === undefined || current === "";
  if (filter.operator === "is_empty") return empty;
  if (filter.operator === "is_not_empty") return !empty;
  const left = String(current ?? "").trim();
  const right = String(filter.value ?? "").trim();
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  if (filter.operator === "equals") return normalizedLeft === normalizedRight;
  if (filter.operator === "not_equals") return normalizedLeft !== normalizedRight;
  if (filter.operator === "contains") return normalizedLeft.includes(normalizedRight);
  if (filter.operator === "not_contains") return !normalizedLeft.includes(normalizedRight);
  if (filter.operator === "starts_with") return normalizedLeft.startsWith(normalizedRight);
  if (filter.operator === "ends_with") return normalizedLeft.endsWith(normalizedRight);
  const leftNumber = Number(current);
  const rightNumber = Number(filter.value);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  return filter.operator === "greater_than" ? leftNumber > rightNumber : leftNumber < rightNumber;
}

export async function listGoogleSpreadsheets(
  context: ConnectorContext,
  options: { query?: string; pageToken?: string } = {},
): Promise<{ resources: GoogleSpreadsheet[]; nextPageToken: string | null }> {
  const clauses = ["mimeType='application/vnd.google-apps.spreadsheet'", "trashed=false"];
  if (options.query?.trim()) {
    const escaped = options.query.trim().replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    clauses.push(`name contains '${escaped}'`);
  }
  const parameters = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "nextPageToken,files(id,name,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    spaces: "drive",
  });
  if (options.pageToken) parameters.set("pageToken", options.pageToken);
  const result = await providerFetch(
    `https://www.googleapis.com/drive/v3/files?${parameters.toString()}`,
    { headers: bearerHeaders(accessToken(context)) },
    driveFilesSchema,
  );
  return { resources: result.files, nextPageToken: result.nextPageToken ?? null };
}

export async function listGoogleSheetTabs(
  context: ConnectorContext,
  spreadsheetId: string,
): Promise<{ spreadsheetName: string; timezone?: string; tabs: GoogleSheetTab[] }> {
  const fields =
    "properties(title,timeZone),sheets(properties(sheetId,title,index,hidden,sheetType,gridProperties(rowCount,columnCount)))";
  const result = await providerFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=false&fields=${encodeURIComponent(fields)}`,
    { headers: bearerHeaders(accessToken(context)) },
    spreadsheetMetadataSchema,
  );
  return {
    spreadsheetName: result.properties.title,
    timezone: result.properties.timeZone,
    tabs: result.sheets
      .filter((sheet) => sheet.properties.sheetType !== "OBJECT")
      .map(({ properties }) => ({
        id: properties.sheetId,
        name: properties.title,
        index: properties.index,
        hidden: properties.hidden ?? false,
        rowCapacity: properties.gridProperties?.rowCount ?? 0,
        columnCount: properties.gridProperties?.columnCount ?? 0,
      }))
      .sort((left, right) => left.index - right.index),
  };
}

export async function previewGoogleSheet(
  context: ConnectorContext,
  input: {
    spreadsheetId: string;
    sheetName: string;
    filters?: GooglePreviewFilter[];
    calculation?: {
      operation: "count" | "distinct_count" | "sum" | "average" | "percentage";
      field?: string;
      value?: string | number | boolean;
    };
    limit?: number;
  },
): Promise<GoogleSheetPreview> {
  const values = await sheetValues(context, input.spreadsheetId, quotedSheetName(input.sheetName));
  const allRecords = rowsToObjects(values);
  const matching = allRecords.filter((record) =>
    (input.filters ?? []).every((filter) => previewFilterPasses(record, filter)),
  );
  const limit = Math.min(10, Math.max(1, Math.trunc(input.limit ?? 3)));
  // Keep the selected latest rows in their original worksheet order so the inspector mirrors Sheets.
  const records = matching.slice(-limit);
  const inferredFields = inferFields(allRecords.slice(-100));
  const inferredByPath = new Map(inferredFields.map((field) => [field.path, field]));
  const orderedPaths = Object.keys(allRecords[0] ?? {}).filter(
    (path) => path !== "__namzi_row_number",
  );
  const fields = orderedPaths.flatMap((path) => {
    const field = inferredByPath.get(path);
    return field ? [field] : [];
  });
  const fieldValues = Object.fromEntries(
    fields.map((field) => [
      field.path,
      [
        ...new Map(
          allRecords.flatMap((record) => {
            const value = record[field.path];
            return typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
              ? [[String(value), value] as const]
              : [];
          }),
        ).values(),
      ].slice(0, 50),
    ]),
  );
  const calculation = input.calculation ?? { operation: "count" as const };
  const valuesForCalculation = calculation.field
    ? matching
        .map((record) => record[calculation.field!])
        .filter((value) => value !== null && value !== undefined && value !== "")
    : [];
  let metricValue = matching.length;
  if (calculation.operation === "distinct_count") {
    metricValue = new Set(valuesForCalculation.map((value) => String(value))).size;
  } else if (calculation.operation === "sum" || calculation.operation === "average") {
    const numbers = valuesForCalculation.map(Number).filter(Number.isFinite);
    const total = numbers.reduce((sum, value) => sum + value, 0);
    metricValue =
      calculation.operation === "average" && numbers.length ? total / numbers.length : total;
  } else if (calculation.operation === "percentage") {
    const expected = String(calculation.value ?? "")
      .trim()
      .toLocaleLowerCase();
    const numerator = calculation.field
      ? matching.filter(
          (record) =>
            String(record[calculation.field!] ?? "")
              .trim()
              .toLocaleLowerCase() === expected,
        ).length
      : 0;
    metricValue = matching.length ? (numerator / matching.length) * 100 : 0;
  }
  return {
    records,
    fields,
    fieldValues,
    totalRecords: allRecords.length,
    matchingRecords: matching.length,
    metricValue,
    refreshedAt: new Date().toISOString(),
  };
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
  const records = rowsToObjects([headers, ...dataValues], plan.dataStartRow);
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
    description:
      "Connect once, then choose any accessible spreadsheet and tab while building metrics.",
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
    const challenge = credential(context, "pkceChallenge");
    const config = env();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: config.GOOGLE_REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
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
    const result = await listGoogleSpreadsheets(context);
    return result.resources.map((file) => ({
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
    const normalized = defaultNormalizedRecord(
      record,
      String(context.configuration.resourceType ?? "row"),
      eventType,
    );
    const timestampColumn = context.configuration.timestampColumn;
    const timestampValue =
      typeof timestampColumn === "string" ? record[timestampColumn] : undefined;
    const occurredAt =
      typeof timestampValue === "string" && !Number.isNaN(Date.parse(timestampValue))
        ? new Date(timestampValue).toISOString()
        : new Date().toISOString();
    return {
      ...normalized,
      occurredAt,
      externalId:
        key === undefined
          ? String(record.__namzi_row_number ?? sha256(JSON.stringify(record)))
          : String(key),
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
