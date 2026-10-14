import { z } from "zod";
import { ENV } from "./_core/env";

const repairLogCellSchema = z.union([z.string().max(20_000), z.number().finite()]);

export const repairLogPayloadSchema = z.object({
  source: z.literal("guide-module-dashboard"),
  sheetName: z.literal("RepairLog"),
  columns: z.array(z.string().trim().min(1).max(128)).min(1).max(20),
  rows: z.array(z.array(repairLogCellSchema).max(20)).max(1_000),
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
  rawUrl = ENV.repairLogScriptUrl,
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
