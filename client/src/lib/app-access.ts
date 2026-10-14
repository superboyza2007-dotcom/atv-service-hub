import { SPECIAL_ACCESS_NAME } from "@shared/const";

export type AppModule = "guide" | "mechanic" | "supervisor";

export type AppIdentity = {
  memberId?: number;
  name: string;
  group: string;
  module: AppModule | null;
  special: boolean;
};

export function moduleForUserGroup(group = ""): AppModule | null {
  if (group.includes("ไกด์")) return "guide";
  if (group.includes("ช่าง")) return "mechanic";
  if (group.includes("หัวหน้า")) return "supervisor";
  return null;
}

/** Only the server session may establish the active user or their module. */
export function identityFromServerSession(
  session: { id?: number; name: string; group: string; special: boolean } | null | undefined,
): AppIdentity | null {
  if (!session) return null;
  return {
    memberId: session.special ? undefined : session.id,
    name: session.name,
    group: session.group,
    module: session.special ? null : moduleForUserGroup(session.group),
    special: session.special,
  };
}

export type AppActor = { id?: string; name: string };

export function resolveAppActor(
  identity: Pick<AppIdentity, "name" | "memberId" | "special"> | null,
  fallback?: AppActor,
): AppActor {
  if (identity?.special) return { id: "special:server-session", name: identity.name || SPECIAL_ACCESS_NAME };
  if (identity) return { id: identity.memberId != null ? String(identity.memberId) : fallback?.id, name: identity.name || fallback?.name || "ผู้ใช้งานปัจจุบัน" };
  return fallback ?? { name: "ผู้ใช้งานปัจจุบัน" };
}

export function canOpenModule(identity: AppIdentity, requested: AppModule): boolean {
  return identity.special || identity.module === requested;
}
