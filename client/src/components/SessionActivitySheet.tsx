import { History } from "lucide-react";
import { completionTimingDetail, formatCompletionDifference, type SessionCompletionTiming } from "@/lib/session-completion-timing";
import { sessionActivitiesOrFallback, sortSessionActivities, type SessionActivity } from "@/lib/session-activity-log";

type SessionActivitySheetSource = {
  sessionId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  activeUserId?: string;
  activeUserName?: string;
  completedByName?: string;
  activityLog?: SessionActivity[];
  completionTiming?: SessionCompletionTiming;
};

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function SessionActivitySheet({ session }: { session: SessionActivitySheetSource }) {
  const activities = sortSessionActivities(sessionActivitiesOrFallback(session));
  const completionSummary = session.completionTiming ? `${completionTimingDetail(session.completionTiming)} · ใช้เวลาจริง ${formatCompletionDifference(session.completionTiming.actualSeconds)}` : undefined;
  const completedByLabel = session.completedByName ? `ผู้จบรายการ: ${session.completedByName}` : undefined;
  return <section className="m3-activity-sheet" aria-labelledby="m3-activity-title">
    <div className="m3-activity-heading"><div><p>SESSION ACTIVITY LOG</p><h3 id="m3-activity-title">ใบบันทึกการปฏิบัติงาน</h3></div><History size={18} aria-hidden="true" /></div>
    {completionSummary && <div className={`m3-completion-summary ${session.completionTiming?.overtimeSeconds ? "is-overtime" : session.completionTiming?.earlySeconds ? "is-early" : "is-on-time"}`}><strong>{completionSummary}</strong><span>กำหนดโปรแกรม {formatCompletionDifference(session.completionTiming?.plannedSeconds ?? 0)}</span>{completedByLabel && <small>{completedByLabel}</small>}</div>}
    {activities.length ? <ol className="m3-activity-list">{activities.map(activity => <li key={activity.id}><span className="m3-activity-dot" aria-hidden="true" /><div><strong>{activity.action}</strong>{activity.detail && <p>{activity.detail}</p>}<small>{activity.actorName} · {formatTime(activity.createdAt)}</small></div></li>)}</ol> : <p className="m3-empty">ยังไม่มีบันทึกกิจกรรม</p>}
  </section>;
}
