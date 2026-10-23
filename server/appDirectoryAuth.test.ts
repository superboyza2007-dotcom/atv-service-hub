import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { APP_DIRECTORY_SESSION_COOKIE, createDirectorySession, createSpecialDirectorySession, directoryCredentialFields, hashDirectoryCode, readDirectorySession, verifyDirectoryCode, verifySpecialAccessCode } from "./appDirectoryAuth";
import { ENV } from "./_core/env";

afterEach(() => vi.unstubAllEnvs());

describe("app directory server authentication", () => {
  it("verifies a salted hash without storing the plaintext code", () => {
    const hashed = hashDirectoryCode(" GUIDE-42 ", "fixed-salt");
    expect(hashed.hash).not.toBe("GUIDE-42");
    expect(verifyDirectoryCode("guide-42", { code: null, codeHash: hashed.hash, codeSalt: hashed.salt })).toBe(false);
    expect(verifyDirectoryCode(" GUIDE-42 ", { code: null, codeHash: hashed.hash, codeSalt: hashed.salt })).toBe(true);
    expect(verifyDirectoryCode("wrong", { code: null, codeHash: hashed.hash, codeSalt: hashed.salt })).toBe(false);
  });

  it("keeps legacy verification available during migration", () => {
    expect(verifyDirectoryCode("guide-legacy", { code: "GUIDE-LEGACY", codeHash: null, codeSalt: null })).toBe(true);
    expect(verifyDirectoryCode("wrong", { code: "GUIDE-LEGACY", codeHash: null, codeSalt: null })).toBe(false);
  });

  it("validates the special code against a server-only value and fails closed when unconfigured", () => {
    expect(verifySpecialAccessCode("  server-test-secret  ", "server-test-secret")).toBe(true);
    expect(verifySpecialAccessCode("wrong", "server-test-secret")).toBe(false);
    expect(verifySpecialAccessCode("server-test-secret", "")).toBe(false);
    expect(verifySpecialAccessCode("short", "short")).toBe(false);
    expect(verifySpecialAccessCode("x".repeat(257), "x".repeat(257))).toBe(false);
  });

  it("validates the configured deployment Special Access secret without exposing it", () => {
    vi.stubEnv("APP_SPECIAL_ACCESS_CODE", "deployment-test-secret-012345");
    expect(ENV.specialAccessCode.length).toBeGreaterThanOrEqual(16);
    expect(verifySpecialAccessCode(ENV.specialAccessCode)).toBe(true);
  });
});


describe("directory session contracts", () => {
  beforeEach(() => vi.stubEnv("ATV_APP_SESSION_SECRET", "test-only-directory-session-secret-0123456789"));

  it("reads a Special Access session without inventing a directory user id", async () => {
    const token = await createSpecialDirectorySession();
    const claims = decodeJwt(token);
    expect(claims.specialAccess).toBe(true);
    expect(claims).not.toHaveProperty("specialAccessCode");
    const session = await readDirectorySession({ cookies: { [APP_DIRECTORY_SESSION_COOKIE]: token } } as never);
    expect(session).toEqual({ specialAccess: true });
  });

  it("reads a regular directory session by immutable user id", async () => {
    const token = await createDirectorySession({ id: 42 });
    const session = await readDirectorySession({ cookies: { [APP_DIRECTORY_SESSION_COOKIE]: token } } as never);
    expect(session).toEqual({ userId: 42 });
  });
});

describe("directory credential fields", () => {
  it("hashes a newly supplied code and verifies only the new code", () => {
    const credentials = directoryCredentialFields("new-code");
    expect(credentials.code).toBeNull();
    expect(credentials.codeHash).toBeTruthy();
    expect(credentials.codeSalt).toBeTruthy();
    expect(verifyDirectoryCode("new-code", credentials)).toBe(true);
    expect(verifyDirectoryCode("old-code", credentials)).toBe(false);
  });

  it("preserves the existing hash when a directory sync omits plaintext code", () => {
    const existing = hashDirectoryCode("existing-code", "fixed-salt");
    const credentials = directoryCredentialFields("", { code: null, codeHash: existing.hash, codeSalt: existing.salt });
    expect(credentials).toEqual({ code: null, codeHash: existing.hash, codeSalt: existing.salt });
    expect(verifyDirectoryCode("existing-code", credentials)).toBe(true);
  });

  it("migrates a legacy plaintext code when a directory sync omits plaintext code", () => {
    const credentials = directoryCredentialFields("", { code: "legacy-code", codeHash: null, codeSalt: null });
    expect(credentials.code).toBeNull();
    expect(credentials.codeHash).toBeTruthy();
    expect(credentials.codeSalt).toBeTruthy();
    expect(verifyDirectoryCode("legacy-code", credentials)).toBe(true);
  });

  it("rejects a new directory row without a code", () => {
    expect(() => directoryCredentialFields("", undefined)).toThrow("Directory code is required for a new user");
  });
});
