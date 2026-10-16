import { describe, expect, it } from "vitest";
import { APP_DIRECTORY_ONLINE_WINDOW_MS, isAppDirectoryUserOnline } from "./appDirectoryPresence";

describe("app-directory presence", () => {
  it("treats a recent server heartbeat as online and a stale one as offline", () => {
    const now = 10_000_000;
    expect(isAppDirectoryUserOnline(new Date(now), now)).toBe(true);
    expect(isAppDirectoryUserOnline(new Date(now - APP_DIRECTORY_ONLINE_WINDOW_MS), now)).toBe(true);
    expect(isAppDirectoryUserOnline(new Date(now - APP_DIRECTORY_ONLINE_WINDOW_MS - 1), now)).toBe(false);
    expect(isAppDirectoryUserOnline(null, now)).toBe(false);
    expect(isAppDirectoryUserOnline(new Date(now + 1), now)).toBe(false);
  });
});
