import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Request } from "express";
import { parse as parseCookie } from "cookie";
import type { AppDirectoryUser } from "../drizzle/schema";
import { ENV } from "./_core/env";

export const APP_DIRECTORY_SESSION_COOKIE = "atv-app-session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type DirectorySession = { userId?: number; specialAccess?: boolean };

function secretKey() {
  if (!ENV.directorySessionSecret) throw new Error("ATV_APP_SESSION_SECRET is required for app directory sessions");
  return new TextEncoder().encode(ENV.directorySessionSecret);
}

export function hashDirectoryCode(rawCode: string, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(rawCode.trim(), salt, 32).toString("hex");
  return { hash: digest, salt };
}

export function directoryCredentialFields(rawCode: string, existing?: Pick<AppDirectoryUser, "code" | "codeHash" | "codeSalt">) {
  const normalizedCode = rawCode.trim();
  if (normalizedCode) {
    const hashed = hashDirectoryCode(normalizedCode);
    return { code: null, codeHash: hashed.hash, codeSalt: hashed.salt };
  }
  if (existing?.codeHash && existing.codeSalt) {
    return { code: null, codeHash: existing.codeHash, codeSalt: existing.codeSalt };
  }
  // Migrate legacy rows server-side when the client omits plaintext code. The value is never returned to the client.
  if (existing?.code?.trim()) {
    const hashed = hashDirectoryCode(existing.code);
    return { code: null, codeHash: hashed.hash, codeSalt: hashed.salt };
  }
  throw new Error("Directory code is required for a new user");
}

export function verifyDirectoryCode(rawCode: string, user: Pick<AppDirectoryUser, "code" | "codeHash" | "codeSalt">) {
  if (user.codeHash && user.codeSalt) {
    const expected = Buffer.from(user.codeHash, "hex");
    const actual = Buffer.from(scryptSync(rawCode.trim(), user.codeSalt, 32).toString("hex"), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return user.code?.trim().toLowerCase() === rawCode.trim().toLowerCase();
}

export function verifySpecialAccessCode(rawCode: string, expectedCode = ENV.specialAccessCode) {
  const expected = Buffer.from(expectedCode.trim(), "utf8");
  const actual = Buffer.from(rawCode.trim(), "utf8");
  return expected.length >= 16 && expected.length <= 256 && actual.length <= 256 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createDirectorySession(user: Pick<AppDirectoryUser, "id">) {
  return new SignJWT({ appDirectoryUserId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function createSpecialDirectorySession() {
  return new SignJWT({ specialAccess: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function readDirectorySession(req: Request): Promise<DirectorySession | null> {
  const token = req.cookies?.[APP_DIRECTORY_SESSION_COOKIE] ?? parseCookie(req.headers.cookie ?? "")[APP_DIRECTORY_SESSION_COOKIE];
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secretKey());
    if (verified.payload.specialAccess === true) {
      return { specialAccess: true };
    }
    const value = verified.payload.appDirectoryUserId;
    const userId = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isInteger(userId) && userId > 0 ? { userId } : null;
  } catch {
    return null;
  }
}

export function appDirectorySessionCookieOptions(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = req.protocol === "https" || (typeof forwardedProto === "string" && forwardedProto.split(",").some(value => value.trim() === "https"));
  return { httpOnly: true, sameSite: isSecure ? "none" as const : "lax" as const, secure: isSecure, path: "/" };
}

export function hashMatches(rawCode: string, hash: string, salt: string) {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(scryptSync(rawCode.trim(), salt, 32).toString("hex"), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function stableCodeFingerprint(rawCode: string) {
  return createHash("sha256").update(rawCode.trim().toLowerCase()).digest("hex");
}
