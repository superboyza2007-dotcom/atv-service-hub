import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AppDirectoryUser, User } from "../../drizzle/schema";
import { getAppDirectoryUserById } from "../db";
import { readDirectorySession } from "../appDirectoryAuth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  appUser: AppDirectoryUser | null;
  appSpecialAccess: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  let appUser: AppDirectoryUser | null = null;
  let appSpecialAccess = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  try {
    const directorySession = await readDirectorySession(opts.req);
    appSpecialAccess = directorySession?.specialAccess === true;
    if (directorySession?.userId != null) {
      appUser = (await getAppDirectoryUserById(directorySession.userId)) ?? null;
    }
  } catch {
    appUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    appUser,
    appSpecialAccess,
  };
}
