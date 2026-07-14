import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const auditValues = vi.fn().mockResolvedValue([]);
  const transaction = vi.fn();
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: selectLimit })),
      })),
    })),
    transaction,
  };
  const tx = {
    update: vi.fn(() => ({ set: updateSet })),
    insert: vi.fn(() => ({ values: auditValues })),
  };
  return { db, tx, selectLimit, transaction, updateWhere, updateSet, auditValues };
});

vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/server/auth/tenant", () => ({
  requireTenantContext: vi.fn().mockResolvedValue({
    organizationId: "00000000-0000-4000-8000-000000000001",
    userId: "prototype-user",
    role: "owner",
  }),
}));

import { DELETE } from "@/app/api/metrics/[metricId]/route";

const metricId = "00000000-0000-4000-8000-000000000002";

describe("metric deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([{ id: metricId, name: "Bookings", archivedAt: null }]);
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
  });

  it("archives the metric instead of physically deleting protected versions", async () => {
    const response = await DELETE(new Request(`https://namzilabs.co/api/metrics/${metricId}`), {
      params: Promise.resolve({ metricId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.tx.update).toHaveBeenCalledOnce();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ archivedAt: expect.any(Date), updatedAt: expect.any(Date) }),
    );
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.tx.insert).toHaveBeenCalledOnce();
    expect(mocks.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "metric.archived", resourceId: metricId }),
    );
    expect(await response.json()).toMatchObject({ data: { id: metricId, deleted: true } });
  });

  it("treats an already archived metric as a successful idempotent delete", async () => {
    mocks.selectLimit.mockResolvedValue([
      { id: metricId, name: "Bookings", archivedAt: new Date("2026-07-14T00:00:00Z") },
    ]);

    const response = await DELETE(new Request(`https://namzilabs.co/api/metrics/${metricId}`), {
      params: Promise.resolve({ metricId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
