import type { ActiveRun } from "./team-board-queue-engine";

export type RunClock = { mode: "elapsed" | "remaining" | "overtime"; seconds: number };

export function runClock(run: Pick<ActiveRun, "startedAt" | "durationSeconds">, now: number, fallbackDurationSeconds: number | null): RunClock {
  const elapsedSeconds = Math.max(0, Math.floor((now - run.startedAt) / 1_000));
  const durationSeconds = run.durationSeconds === undefined ? fallbackDurationSeconds : run.durationSeconds;
  if (durationSeconds === null) return { mode: "elapsed", seconds: elapsedSeconds };
  const remainingSeconds = Math.ceil((run.startedAt + durationSeconds * 1_000 - now) / 1_000);
  if (remainingSeconds > 0) return { mode: "remaining", seconds: remainingSeconds };
  return { mode: "overtime", seconds: Math.max(0, Math.floor((now - (run.startedAt + durationSeconds * 1_000)) / 1_000)) };
}

export function expiredLocalRunIds(runs: ActiveRun[], now: number, fallbackDurationSeconds: number | null): string[] {
  return runs.flatMap(run => {
    if (run.externalEventId) return [];
    const durationSeconds = run.durationSeconds === undefined ? fallbackDurationSeconds : run.durationSeconds;
    return durationSeconds !== null && now - run.startedAt >= durationSeconds * 1_000 ? [run.id] : [];
  });
}
