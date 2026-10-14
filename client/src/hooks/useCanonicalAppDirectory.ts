import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";


export type CanonicalDirectoryUser = { id: number; name: string; group?: string; code?: string; hasCode?: boolean };

export function normalizeCanonicalDirectoryUsers(value: unknown): CanonicalDirectoryUser[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((user): user is { id?: number; name?: string; group?: string; code?: string; hasCode?: boolean } => Boolean(user && typeof user === "object"))
    .filter(user => Number.isInteger(user.id) && typeof user.name === "string" && user.name.trim().length > 0)
    .map(user => ({
      id: Number(user.id),
      name: user.name!.trim(),
      group: typeof user.group === "string" ? user.group.trim() : undefined,
      code: typeof user.code === "string" ? user.code.trim() : undefined,
      hasCode: user.hasCode === true,
    }));
}


/** One shared door for the app directory: the Server query is the only source of truth. */
export function useCanonicalAppDirectory() {
  const query = trpc.directory.list.useQuery(undefined, { retry: false, refetchOnWindowFocus: true, refetchInterval: 1000 });
  const [users, setUsers] = useState<CanonicalDirectoryUser[]>([]);
  const remoteUsers = useMemo(() => normalizeCanonicalDirectoryUsers(query.data), [query.data]);

  useEffect(() => {
    if (query.isSuccess && Array.isArray(query.data)) setUsers(remoteUsers);
  }, [query.isSuccess, query.data, remoteUsers]);

  return { ...query, users };
}
