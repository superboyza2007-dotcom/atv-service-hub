import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { describe, expect, it } from "vitest";
import superjson from "superjson";
import type { AppRouter } from "./routers";
import { ENV } from "./_core/env";

const runSecretApiSmoke = process.env.RUN_SECRET_API_SMOKE === "1";

describe.skipIf(!runSecretApiSmoke)("production server secrets via local API", () => {
  it("authenticates Special Access and validates the configured Sheets endpoint", async () => {
    expect(ENV.specialAccessCode.length).toBeGreaterThanOrEqual(16);
    expect(ENV.repairLogScriptUrl.length).toBeGreaterThan(0);

    let cookie = "";
    const fetchWithSessionCookie: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(input, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    };

    const client = createTRPCProxyClient<AppRouter>({
      links: [httpBatchLink({
        url: process.env.WEBDEV_TEST_API_URL ?? "http://127.0.0.1:3000/api/trpc",
        transformer: superjson,
        fetch: fetchWithSessionCookie,
      })],
    });
    const auth = await client.directory.specialAuthenticate.mutate({ code: ENV.specialAccessCode });
    expect(auth?.special).toBe(true);
    expect(cookie).toContain("atv-app-session=");

    const status = await client.repairLog.status.query();
    expect(status.configured).toBe(true);
  });
});
