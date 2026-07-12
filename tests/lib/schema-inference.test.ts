import { describe, expect, it } from "vitest";

import { inferFields } from "@/connectors/schema-inference";

describe("schema inference", () => {
  it("keeps unknown nested fields and infers types", () => {
    expect(
      inferFields([
        { id: 1, contact: { email: "person@example.com" }, happenedAt: "2026-07-11T12:00:00Z" },
      ]),
    ).toEqual(
      expect.arrayContaining([
        { path: "id", type: "number", nullable: false },
        { path: "contact.email", type: "string", nullable: false },
        { path: "happenedAt", type: "date", nullable: false },
      ]),
    );
  });
});
