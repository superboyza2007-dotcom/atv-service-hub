export const PTT_ROOM_ID = "atv-operations-main";

export type PttModule = "guide" | "mechanic" | "supervisor";

export function makePttClientId(): string {
  if (typeof window === "undefined") return "server-client";
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function pttModuleFromQuery(search: string): PttModule {
  const module = new URLSearchParams(search).get("module");
  return module === "mechanic" ? "mechanic" : module === "supervisor" ? "supervisor" : "guide";
}

export function pttModuleLabel(module: PttModule): string {
  return module === "mechanic" ? "ช่าง" : module === "supervisor" ? "หัวหน้า" : "ไกด์";
}

export function shouldPromptForPttAccess(connected: boolean, permissionGranted: boolean): boolean {
  return connected && !permissionGranted;
}

export function getPttSocketUrl(locationLike: Pick<Location, "protocol" | "host">): string {
  const protocol = locationLike.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${locationLike.host}/api/ptt`;
}
