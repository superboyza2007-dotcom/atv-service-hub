export type SessionActivity = {
  id: string;
  actorId?: string;
  actorName: string;
  action: string;
  detail?: string;
  createdAt: string;
};

type SessionActivitySource = {
  sessionId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  activeUserId?: string;
  activeUserName?: string;
  completedByName?: string;
  activityLog?: SessionActivity[];
};

export function createSessionActivity(input: Omit<SessionActivity, "id"> & { id?: string }): SessionActivity {
  return {
    id: input.id ?? `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actorId: input.actorId,
    actorName: input.actorName.trim() || "ไม่ระบุผู้ทำรายการ",
    action: input.action.trim(),
    detail: input.detail?.trim() || undefined,
    createdAt: input.createdAt,
  };
}

export function appendSessionActivity(activities: SessionActivity[] | undefined, activity: SessionActivity): SessionActivity[] {
  return [...(activities ?? []), activity];
}

export function sessionActivitiesOrFallback(session: SessionActivitySource): SessionActivity[] {
  if (session.activityLog?.length) return session.activityLog;
  const actorName = session.activeUserName ?? "ไม่ระบุผู้ทำรายการ";
  const fallback: SessionActivity[] = [
    createSessionActivity({ id: `${session.sessionId}-created`, actorId: session.activeUserId, actorName, action: "สร้างรายการ", detail: "บันทึกย้อนหลังจากข้อมูล Session เดิม", createdAt: session.createdAt }),
  ];
  if (session.startedAt) {
    fallback.push(createSessionActivity({ id: `${session.sessionId}-started`, actorId: session.activeUserId, actorName, action: "เริ่มงาน → Active", createdAt: session.startedAt }));
  }
  if (session.completedAt) {
    fallback.push(createSessionActivity({ id: `${session.sessionId}-completed`, actorName: session.completedByName ?? actorName, action: "จบงาน → Completed", createdAt: session.completedAt }));
  }
  return fallback;
}

export function sortSessionActivities(activities: SessionActivity[]): SessionActivity[] {
  return [...activities].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
