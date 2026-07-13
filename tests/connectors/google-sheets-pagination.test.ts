import { describe, expect, it } from "vitest";

import { googleSheetsConnector, planSheetPage } from "@/connectors/providers/google-sheets";
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
