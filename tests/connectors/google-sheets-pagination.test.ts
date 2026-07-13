import { describe, expect, it } from "vitest";

import {
  columnName,
  googleSheetsConnector,
  planSheetPage,
  rowsToObjects,
} from "@/connectors/providers/google-sheets";
import type { ConnectorContext } from "@/connectors/types";

describe("Google Sheets pagination", () => {
  it("keeps the header fixed while advancing non-overlapping data pages", () => {
    expect(planSheetPage("Leads!A:Z", undefined, 500)).toMatchObject({
      headerRange: "Leads!A1:Z1",
      dataRange: "Leads!A2:Z501",
      nextCursorCandidate: "502",
    });
    expect(planSheetPage("Leads!A:Z", "502", 500)).toMatchObject({
      headerRange: "Leads!A1:Z1",
      dataRange: "Leads!A502:Z1001",
      nextCursorCandidate: "1002",
    });
  });

  it("honors a bounded range and can plan a 100,000-row sheet without gaps", () => {
    let cursor: string | undefined;
    let expectedStart = 2;
    let pages = 0;
    do {
      const page = planSheetPage("'Large Sheet'!A1:AZ100001", cursor, 1_000);
      expect(page.dataStartRow).toBe(expectedStart);
      expectedStart = page.dataEndRow + 1;
      cursor = page.nextCursorCandidate ?? undefined;
      pages += 1;
    } while (cursor);
    expect(expectedStart).toBe(100_002);
    expect(pages).toBe(100);
  });

  it("rejects malformed ranges and cursors instead of silently skipping data", () => {
    expect(() => planSheetPage("Leads", undefined, 500)).toThrow("A1 column range");
    expect(() => planSheetPage("Leads!A:Z", "1", 500)).toThrow("cursor is invalid");
  });

  it("converts discovered sheet widths to bounded A1 columns", () => {
    expect(columnName(1)).toBe("A");
    expect(columnName(26)).toBe("Z");
    expect(columnName(27)).toBe("AA");
    expect(columnName(702)).toBe("ZZ");
  });

  it("preserves worksheet column and row order for the data inspector", () => {
    const records = rowsToObjects([
      ["email", "booked", "meeting date"],
      ["first@example.com", "No", "2026-07-10"],
      ["second@example.com", "Yes", "2026-07-11"],
    ]);
    expect(Object.keys(records[0]!).slice(0, 3)).toEqual(["email", "booked", "meeting date"]);
    expect(records.map((record) => record.email)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
  });

  it("uses the configured unique key so row reordering does not change identity", async () => {
    const context: ConnectorContext = {
      organizationId: "00000000-0000-4000-8000-000000000001",
      connectionId: "00000000-0000-4000-8000-000000000002",
      callbackUrl: "https://example.com/hook",
      credentials: {},
      configuration: { uniqueKeyColumn: "Lead ID", syncMode: "upsert" },
    };
    const first = await googleSheetsConnector.normalizeRecord(context, {
      "Lead ID": "lead_42",
      Name: "Ada",
    });
    const reordered = await googleSheetsConnector.normalizeRecord(context, {
      Name: "Ada",
      "Lead ID": "lead_42",
    });
    expect(first.externalId).toBe("lead_42");
    expect(reordered.externalId).toBe(first.externalId);
  });
});
