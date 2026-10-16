export const APP_DIRECTORY_ONLINE_WINDOW_MS = 60_000;

export function isAppDirectoryUserOnline(lastSeenAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const ageMs = now - lastSeenAt.getTime();
  return ageMs >= 0 && ageMs <= APP_DIRECTORY_ONLINE_WINDOW_MS;
}
