import { deleteMechanicRepairRecordsAfterExport, listPendingMechanicRepairRecords } from "./mechanicRepairService";
import { buildRepairLogSheetPayload, getRepairLogScriptUrl, isRepairLogSheetConfigured, submitRepairLogSheetPayload } from "./repairLogGoogleSheets";

export type RepairLogExportResult = {
  sentCount: number;
  deletedCount: number;
  sentAt: string;
};

/** Send one bounded batch, then remove only unchanged rows after Google confirms the write. */
export async function exportPendingMechanicRepairRecords(): Promise<RepairLogExportResult> {
  const pending = await listPendingMechanicRepairRecords();
  const sentAt = new Date();
  if (!pending.length) {
    const deletedCount = await deleteMechanicRepairRecordsAfterExport([]);
    return { sentCount: 0, deletedCount, sentAt: sentAt.toISOString() };
  }

  const scriptUrl = await getRepairLogScriptUrl();
  if (!isRepairLogSheetConfigured(scriptUrl)) throw new Error("Google Sheets repair-log integration is not configured");
  await submitRepairLogSheetPayload(buildRepairLogSheetPayload(pending, sentAt), scriptUrl);

  const deletedCount = await deleteMechanicRepairRecordsAfterExport(pending.map(record => ({ id: record.id, updatedAt: record.updatedAt })));
  return {
    sentCount: pending.length,
    deletedCount,
    sentAt: sentAt.toISOString(),
  };
}
