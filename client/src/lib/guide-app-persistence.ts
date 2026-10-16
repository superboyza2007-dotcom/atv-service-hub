export type GuideAppSnapshot = Record<string, unknown>;

type StorageReader = (key: string) => string | null;

export function readGuideAppSnapshot(read: StorageReader, sharedKey: string, legacyKey: string): GuideAppSnapshot | null {
  for (const key of [sharedKey, legacyKey]) {
    try {
      const raw = read(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as GuideAppSnapshot;
    } catch {
      // Continue to the legacy source if the preferred snapshot is malformed.
    }
  }
  return null;
}

export function serializeGuideAppSnapshot(snapshot: GuideAppSnapshot) {
  return JSON.stringify(snapshot);
}
