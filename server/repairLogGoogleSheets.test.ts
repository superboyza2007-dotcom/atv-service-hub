import { describe, expect, it, vi } from "vitest";
import {
  isRepairLogSheetConfigured,
  parseAllowedAppsScriptUrl,
  submitRepairLogSheetPayload,
  type RepairLogPayload,
} from "./repairLogGoogleSheets";

const endpoint = "https://script.google.com/macros/s/test-deployment/exec";
const payload: RepairLogPayload = {
  source: "guide-module-dashboard",
  sheetName: "RepairLog",
  columns: ["รายการ"],
  rows: [["repair-1"]],
  sentAt: "2026-09-28T00:00:00.000Z",
};

describe("server-side Google Apps Script repair-log proxy", () => {
  it("accepts only HTTPS Apps Script web-app endpoints", () => {
    expect(parseAllowedAppsScriptUrl(endpoint)?.hostname).toBe("script.google.com");
    expect(parseAllowedAppsScriptUrl(`${endpoint}?channel=repair`)).not.toBeNull();
    expect(parseAllowedAppsScriptUrl("http://script.google.com/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://example.com/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://script.google.com.evil.test/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://script.google.com:8443/macros/s/id/exec")).toBeNull();
    expect(isRepairLogSheetConfigured("")).toBe(false);
  });

  it("validates the configured production Apps Script endpoint without exposing it", () => {
    expect(isRepairLogSheetConfigured(endpoint)).toBe(true);
    expect(isRepairLogSheetConfigured("")).toBe(false);
  });

  it("posts the payload and follows only Google's Apps Script content redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://script.googleusercontent.com/macros/echo?key=test" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await expect(submitRepairLogSheetPayload(payload, endpoint, fetchImpl as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("GET");
  });

  it("rejects redirects to untrusted hosts without making a second request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/collect" },
    }));

    await expect(submitRepairLogSheetPayload(payload, endpoint, fetchImpl as typeof fetch)).rejects.toThrow("untrusted redirect");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when no server endpoint has been configured", async () => {
    const fetchImpl = vi.fn();
    await expect(submitRepairLogSheetPayload(payload, "", fetchImpl as typeof fetch)).rejects.toThrow("not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
