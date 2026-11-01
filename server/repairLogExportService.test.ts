import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMechanicRepairRecordsAfterExport: vi.fn(),
  listPendingMechanicRepairRecords: vi.fn(),
  buildRepairLogSheetPayload: vi.fn(),
  getRepairLogScriptUrl: vi.fn(),
  isRepairLogSheetConfigured: vi.fn(),
  submitRepairLogSheetPayload: vi.fn(),
}));

vi.mock("./mechanicRepairService", () => ({
  deleteMechanicRepairRecordsAfterExport: mocks.deleteMechanicRepairRecordsAfterExport,
  listPendingMechanicRepairRecords: mocks.listPendingMechanicRepairRecords,
}));
vi.mock("./repairLogGoogleSheets", () => ({
  buildRepairLogSheetPayload: mocks.buildRepairLogSheetPayload,
  getRepairLogScriptUrl: mocks.getRepairLogScriptUrl,
  isRepairLogSheetConfigured: mocks.isRepairLogSheetConfigured,
  submitRepairLogSheetPayload: mocks.submitRepairLogSheetPayload,
}));

import { exportPendingMechanicRepairRecords } from "./repairLogExportService";

describe("mechanic repair-log export cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRepairLogScriptUrl.mockResolvedValue("https://script.google.com/macros/s/test/exec");
    mocks.isRepairLogSheetConfigured.mockReturnValue(true);
    mocks.buildRepairLogSheetPayload.mockReturnValue({ rows: [["record"]] });
    mocks.submitRepairLogSheetPayload.mockResolvedValue({ ok: true });
    mocks.deleteMechanicRepairRecordsAfterExport.mockResolvedValue(1);
  });

  it("deletes the unchanged record only after Sheets confirms the write", async () => {
    mocks.listPendingMechanicRepairRecords.mockResolvedValue([{ id: "RP-1", updatedAt: "2026-11-01T10:00:00.000Z" }]);
    await expect(exportPendingMechanicRepairRecords()).resolves.toMatchObject({ sentCount: 1, deletedCount: 1 });
    expect(mocks.submitRepairLogSheetPayload).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMechanicRepairRecordsAfterExport).toHaveBeenCalledWith([{ id: "RP-1", updatedAt: "2026-11-01T10:00:00.000Z" }]);
  });

  it("keeps database records when Sheets does not confirm the write", async () => {
    mocks.listPendingMechanicRepairRecords.mockResolvedValue([{ id: "RP-1", updatedAt: "2026-11-01T10:00:00.000Z" }]);
    mocks.submitRepairLogSheetPayload.mockRejectedValue(new Error("No confirmation"));
    await expect(exportPendingMechanicRepairRecords()).rejects.toThrow("No confirmation");
    expect(mocks.deleteMechanicRepairRecordsAfterExport).not.toHaveBeenCalled();
  });

  it("cleans previously confirmed exports even when no new records are waiting", async () => {
    mocks.listPendingMechanicRepairRecords.mockResolvedValue([]);
    mocks.deleteMechanicRepairRecordsAfterExport.mockResolvedValue(4);
    await expect(exportPendingMechanicRepairRecords()).resolves.toMatchObject({ sentCount: 0, deletedCount: 4 });
    expect(mocks.submitRepairLogSheetPayload).not.toHaveBeenCalled();
    expect(mocks.deleteMechanicRepairRecordsAfterExport).toHaveBeenCalledWith([]);
  });
});
