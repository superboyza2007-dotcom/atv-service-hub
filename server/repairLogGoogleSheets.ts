import { z } from "zod";
import { ENV } from "./_core/env";
import { getAppOperationsSnapshot } from "./db";

export const REPAIR_LOG_SETTINGS_SNAPSHOT_KEY = "atv-repair-log-settings-v1";

export const REPAIR_LOG_SHEET_COLUMNS = [
  "รหัสรายการ",
  "วันที่และเวลา",
  "วันที่แก้ไข",
  "เวลาซ่อมรวม",
  "เบอร์รถ",
  "รายละเอียด",
  "อะไหล่เบิกซ่อม",
  "ชื่อช่างผู้ทำรายการ",
  "ชั่วโมงสะสม",
  "สถานะ",
  "ตัวเลือก",
  "รหัสแจ้งซ่อมจากไกด์",
  "ประเภท",
] as const;

const repairLogCellSchema = z.union([z.string().max(20_000), z.number().finite()]);
const repairLogColumnsSchema = z.array(z.string()).length(REPAIR_LOG_SHEET_COLUMNS.length).refine(
  columns => columns.every((column, index) => column === REPAIR_LOG_SHEET_COLUMNS[index]),
  "RepairLog columns must match the configured 13-column contract",
);
const repairLogRowSchema = z.array(repairLogCellSchema).length(REPAIR_LOG_SHEET_COLUMNS.length);

export const repairLogPayloadSchema = z.object({
  source: z.literal("guide-module-dashboard"),
  sheetName: z.literal("RepairLog"),
  columns: repairLogColumnsSchema,
  rows: z.array(repairLogRowSchema).min(1).max(1_000),
  sentAt: z.string().datetime(),
});

export type RepairLogPayload = z.infer<typeof repairLogPayloadSchema>;

export function parseAllowedAppsScriptUrl(rawValue: string): URL | null {
  try {
    const url = new URL(rawValue.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !/^\/macros\/s\/[^/]+\/exec\/?$/i.test(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isRepairLogSheetConfigured(rawValue = ENV.repairLogScriptUrl): boolean {
  return parseAllowedAppsScriptUrl(rawValue) !== null;
}

export async function getRepairLogScriptUrl(): Promise<string> {
  const payload = await getAppOperationsSnapshot(REPAIR_LOG_SETTINGS_SNAPSHOT_KEY);
  if (payload) {
    try {
      const value = JSON.parse(payload) as { scriptUrl?: unknown };
      if (typeof value.scriptUrl === "string" && isRepairLogSheetConfigured(value.scriptUrl)) return value.scriptUrl.trim();
    } catch {
      // Fall back to the environment setting when the saved setting is invalid.
    }
  }
  return isRepairLogSheetConfigured(ENV.repairLogScriptUrl) ? ENV.repairLogScriptUrl.trim() : "";
}

function parseAllowedGoogleRedirect(location: string, baseUrl: URL): URL | null {
  try {
    const url = new URL(location, baseUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.googleusercontent.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !url.pathname.startsWith("/macros/")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function submitRepairLogSheetPayload(
  payload: RepairLogPayload,
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true }> {
  const endpoint = parseAllowedAppsScriptUrl(rawUrl);
  if (!endpoint) throw new Error("Google Apps Script repair-log endpoint is not configured");

  const body = JSON.stringify(payload);
  const timeout = AbortSignal.timeout(15_000);
  let response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
    redirect: "manual",
    signal: timeout,
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    const redirectUrl = location ? parseAllowedGoogleRedirect(location, endpoint) : null;
    if (!redirectUrl) throw new Error("Google Apps Script returned an untrusted redirect");

    const redirectMethod = [307, 308].includes(response.status) ? "POST" : "GET";
    response = await fetchImpl(redirectUrl, {
      method: redirectMethod,
      ...(redirectMethod === "POST" ? { headers: { "Content-Type": "text/plain;charset=utf-8" }, body } : {}),
      redirect: "error",
      signal: timeout,
    });
  }

  if (!response.ok) throw new Error("Google Apps Script returned an unsuccessful response");
  const result = await response.json().catch(() => null) as { ok?: unknown } | null;
  if (result?.ok !== true) throw new Error("Google Apps Script did not confirm the repair-log write");
  return { ok: true };
}
