import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, ArrowLeft, BarChart3, CalendarDays, Check, Clock3, Database, Languages, LayoutDashboard, ListChecks, MessageCircle, Plus, RefreshCw, Settings2, Truck, UsersRound } from "lucide-react";
import { ActiveVehicleDetailList } from "@/components/ActiveVehicleDetailList";
import { VehicleChoiceList, VehicleReplacementPanel, type VehicleChoiceItem } from "@/components/VehicleChoiceList";
import { VehicleSafetyNoticeDialog, VehicleSafetyNoticeIndicator, VehicleSafetyNoticeList } from "@/components/VehicleSafetyNotice";
import { ActiveSessionChat, type ActiveSessionChatMessage } from "@/components/ActiveSessionChat";
import { ServerActiveSessionChat } from "@/components/ServerActiveSessionChat";
import { availableReplacementVehicleNumbers } from "@/lib/active-vehicle-selection";
import { DAILY_TIME_SLOTS, buildDailyActiveTimeline, groupDailyActiveTimelineBySlot } from "@/lib/daily-active-timeline";
import { findSupervisorGuideSession, normalizeSupervisorGuideMembers, normalizeSupervisorGuideSessions, type SupervisorGuideMember, type SupervisorGuideSession } from "@/lib/supervisor-guide-operations";
import { supervisorActiveTimeLabel } from "@/lib/supervisor-active-timing";
import { formatSessionCountdown, sessionTiming } from "@/lib/session-countdown";
import { activeCompletionCopy, createActiveCompletionPrompt, isActiveCompletionPromptFor, type ActiveCompletionPrompt } from "@/lib/active-completion";
import { completionTimingDetail, formatCompletionDifference, sessionCompletionTiming, type SessionCompletionTiming } from "@/lib/session-completion-timing";
import { appendSessionActivity, createSessionActivity, type SessionActivity } from "@/lib/session-activity-log";
import { mergeGuideRepairReports, type GuideRepairReport } from "@/lib/mechanic-guide-repair";
import { addSupervisorUser, getSupervisorManagerOptions, SUPERVISOR_USER_GROUPS, updateSupervisorUser } from "@/lib/supervisor-users";
import { memberGroupClass } from "@/lib/member-group-style";
import { formatGroupManagerNames, resolveVehicleManagerNames, resolveVehicleResponsibilityView } from "@/lib/vehicle-manager-resolver";
import { addSupervisorFleetGroup, addSupervisorVehicle, availableManagersForFleetGroup, availableVehiclesForFleetGroup, updateSupervisorFleetGroup } from "@/lib/supervisor-database";
import { buildSupervisorInputVehicles, buildSupervisorUserDirectoryStatusModel, buildSupervisorUserDirectoryStatusSource, resolveSupervisorOperationalStatus, supervisorStatusLabel, pickupRequestsInResponsibilityGroups, type SupervisorVehicleStatus } from "@/lib/supervisor-data";
import { addResponsibilityGroupToState, addVehicleToResponsibilityState, getResponsibilityGroupColor, getUnassignedVehicleNumbers, removeManagerFromResponsibilityState, removeResponsibilityGroupFromState, removeVehicleFromResponsibilityState, setVehicleStatusForNumbers, updateResponsibilityGroupInState, updateVehicleInResponsibilityState, type VehicleResponsibilityState } from "@/lib/vehicle-responsibility-store";
import { type VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { type VehiclePickupRequest } from "@/lib/vehicle-pickup-notifications";
import { deriveOperationalStatusOverrides } from "@/lib/vehicle-operation-reconciliation";
import { summarizeVehicleUsageHours } from "@/lib/vehicle-usage-hours";
import { PttRoomPanel } from "@/components/PttRoom";
import CommunicationChat from "@/components/CommunicationChat";
import ModuleLogoutButton from "@/components/ModuleLogoutButton";
import { trpc } from "@/lib/trpc";
import { OPERATIONS_SNAPSHOT_KEYS, parseOperationsSnapshot, serializeOperationsSnapshot } from "@/lib/operations-snapshot";
import { mergeVehiclePickupRequests, mergeVehicleSafetyNotices, type VehicleFlowSnapshot } from "@/lib/vehicle-flow-snapshot";
import { mergeSessionChatMessages } from "@/lib/session-chat-sync";
import { mergeSharedSessions } from "@/lib/shared-session-sync";
import { filterSupervisorRoundTableUsers } from "@/lib/mechanic-round-table";
import type { PayoutSessionLike, PersonalPayoutValues } from "@/lib/mechanic-payout-table";
import { SupervisorPayoutOverview } from "@/components/SupervisorPayoutOverview";
import TeamBoardQueueModule from "@/components/TeamBoardQueueModule";
import { VehicleResponsibilityGroupView } from "@/components/VehicleResponsibilityGroupView";
import { DisconnectedVehicleStatusCards } from "@/components/DisconnectedVehicleStatusCards";
import { SupervisorStandbyCreator, type SupervisorStandbyDraft } from "@/components/SupervisorStandbyCreator";
import { findSessionConflict, findSessionDraftDuplicates } from "@/lib/session-conflicts";
import { useCanonicalAppDirectory } from "@/hooks/useCanonicalAppDirectory";

type SupervisorTab = "dashboard" | "status" | "issues" | "communication" | "settings" | "queuePayout" | "database";
type DataTab = "users" | "vehicles" | "fleet-groups" | "usage-hours";
type SupervisorDetailAction = "members" | "addVehicle" | "replaceVehicle" | "removeVehicle" | null;
type DirectoryUser = { id: number; name: string; group?: string; code?: string; hasCode?: boolean };
type VehicleRecord = { number: number; cc: "200" | "250" };
type FleetGroup = { id: string; name: string; vehicleNumbers: number[]; managerIds: number[]; color?: string };
type GuideState = { repairReports?: unknown; sessions?: unknown[]; messages?: unknown[]; alertReports?: unknown[]; members?: unknown[]; payoutRoundValues?: PersonalPayoutValues };
type MechanicState = { alerts?: unknown[]; repairs?: unknown[] };
type SupervisorUsageHours = { number: string; cc: "200" | "250"; round30: number; round60: number; totalRounds: number; accumulatedHours: number; lastUsedAt?: string };
type SupervisorSnapshot = {
  vehicleState: VehicleResponsibilityState;
  directoryUsers: DirectoryUser[];
  guideReports: GuideRepairReport[];
  guideState: GuideState;
  mechanicState: MechanicState;
  vehicleDatabase: VehicleRecord[];
  fleetGroups: FleetGroup[];
  pickupRequests: VehiclePickupRequest[];
  usageHours: SupervisorUsageHours[];
};

type VehicleRow = { number: number; cc: "200" | "250"; status: SupervisorVehicleStatus; group: string; manager: string; color: string };

const EMPTY_SUPERVISOR_SNAPSHOT: SupervisorSnapshot = {
  vehicleState: { version: 1, vehicleGroups: [], responsibilityGroups: [], updatedAt: 0 },
  directoryUsers: [],
  guideReports: [],
  guideState: {},
  mechanicState: {},
  vehicleDatabase: [],
  fleetGroups: [],
  pickupRequests: [],
  usageHours: [],
};


function supervisorGroupLabel(group?: string) {
  if (group?.includes("ไกด์")) return "ไกด์";
  if (group?.includes("ช่าง")) return "ช่าง";
  if (group?.includes("ดิวตี้")) return "ดิวตี้";
  if (group?.includes("หัวหน้า")) return "หัวหน้า";
  return group || "ไม่ระบุกลุ่ม";
}

function vehicleRecordsFromState(state: VehicleResponsibilityState): VehicleRecord[] {
  return state.vehicleGroups.flatMap(group => group.numbers.map(number => ({ number, cc: group.cc.replace(/cc/gi, '') as "200" | "250" })));
}

function fleetGroupsFromState(state: VehicleResponsibilityState): FleetGroup[] {
  return state.responsibilityGroups.map(group => ({ id: String(group.id), name: group.name ?? `กลุ่ม ${group.id}`, vehicleNumbers: group.vehicleNumbers, managerIds: group.managers, color: group.color || "#81e597" }));
}

function persistCanonicalVehicleState(state: { vehicleGroups: VehicleResponsibilityState["vehicleGroups"]; responsibilityGroups: VehicleResponsibilityState["responsibilityGroups"] }): VehicleResponsibilityState {
  // Server fleet snapshot is authoritative. Keep this pure so browser storage
  // cannot become a second database or overwrite a newer server revision.
  return { ...state, version: 1, updatedAt: Date.now() };
}


function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function countMechanicItems(state: MechanicState, key: "alerts" | "repairs") {
  return Array.isArray(state[key]) ? state[key].length : 0;
}

function SupervisorDailyActiveCard({ session, members, onOpen }: { session: SupervisorGuideSession; members: SupervisorGuideMember[]; onOpen: () => void }) {
  const names = session.memberIds.map(id => members.find(member => member.id === id)?.name).filter((name): name is string => Boolean(name)).join(" · ") || session.activeUserName || "ไม่ระบุผู้ปฏิบัติงาน";
  return <button type="button" className="m3-daily-board-card m3-daily-board-card-compact" aria-label={`ดูรายละเอียด ${names}`} onClick={onOpen}>
    <strong>{names}</strong>
    <span>โปรแกรม {session.durationMinutes} นาที</span>
    <small>R {session.riderCount} · P {session.passengerCount}</small>
  </button>;
}

type SupervisorDashboardProps = {
  vehicles: VehicleRow[];
  safetyNotices: VehicleSafetyNotice[];
  activeSessions: SupervisorGuideSession[];
  standbySessions: SupervisorGuideSession[];
  members: SupervisorGuideMember[];
  now: number;
  notice: string;
  onOpenSession: (session: SupervisorGuideSession) => void;
  onOpenQueue: () => void;
  onRefresh: () => void;
  onOpenStatusView: () => void;
  statusModel: ReturnType<typeof buildSupervisorUserDirectoryStatusModel>;
};

function SupervisorDashboard({ vehicles, safetyNotices, activeSessions, standbySessions, members, now, notice, onOpenSession, onOpenQueue, onRefresh, onOpenStatusView, statusModel }: SupervisorDashboardProps) {
  const namesForSession = (session: SupervisorGuideSession) => session.memberIds.map(id => members.find(member => member.id === id)?.name).filter(Boolean).join(" · ") || session.activeUserName || "ไม่ระบุผู้ปฏิบัติงาน";
  return <section className="m3-panel supervisor-guide-panel">
    <div className="m3-panel-title">
      <div><p>DASHBOARD / STATUS VIEW</p><h2>สถานะรถ ATV ของ Supervisor</h2><small className="m3-demo-badge">LIVE DATABASE · รวมทุกกลุ่มจากข้อมูล Guide</small></div>
      <button className="m3-icon-button" type="button" onClick={onRefresh} aria-label="รีเฟรชข้อมูลรถ"><RefreshCw size={16} /></button>
    </div>
          <DisconnectedVehicleStatusCards vehicles={vehicles} safetyNotices={safetyNotices} statusModel={statusModel} onOpenGroupView={onOpenStatusView} />
    <div className="m3-dashboard-actions"><button className="m3-primary" type="button" onClick={onOpenQueue}><Plus size={16} /> สร้างรายการ 2.1</button></div>
    <div className="m3-lists">
      <div><div className="m3-list-heading"><h3>กำลังทำงาน / Active</h3><span>{activeSessions.length}</span></div>{activeSessions.map(session => { const timing = supervisorActiveTimeLabel(session.startedAt, session.durationMinutes, now); return <button type="button" className={`m3-session-row ${timing.overtimeSeconds > 0 ? "is-overtime" : ""}`} key={session.sessionId} onClick={() => onOpenSession(session)}><b>{namesForSession(session)}</b><span>โปรแกรม {session.durationMinutes} นาที · R {session.riderCount} · P {session.passengerCount}</span><small>{timing.label}</small></button>; })}{!activeSessions.length && <p className="m3-empty">ไม่มีรายการ Active</p>}</div>
      <div><div className="m3-list-heading"><h3>รอเริ่มงาน / Standby</h3><span>{standbySessions.length}</span></div>{standbySessions.map(session => <button type="button" className="m3-session-row" key={session.sessionId} onClick={() => onOpenSession(session)}><b>{session.sessionId}</b><span>{session.vehicleIds.map(id => `#${id.replace(/^m3-v/, "")}`).join(" ")}</span><small>รอเริ่มงาน</small></button>)}{!standbySessions.length && <p className="m3-empty">ไม่มีรายการ Standby</p>}</div>
    </div>
    {notice && <p className="m3-notice">{notice}</p>}
  </section>;
}

function SupervisorDailyBoard({ timeline, bySlot, members, notice, onOpenSession }: { timeline: SupervisorGuideSession[]; bySlot: Record<(typeof DAILY_TIME_SLOTS)[number], SupervisorGuideSession[]>; members: SupervisorGuideMember[]; notice: string; onOpenSession: (session: SupervisorGuideSession) => void }) {
  const dateLabel = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "numeric", year: "2-digit" }).format(new Date());
  return <section className="m3-panel supervisor-guide-panel m3-daily-shell"><div className="m3-panel-title"><div><p>DAILY BOARD / LOG</p><h2>บอร์ดบันทึกรายวัน</h2><span>ข้อมูลเดียวกับ Guide · รวมทุกกลุ่ม</span></div><CalendarDays size={22} /></div><div className="m3-daily-summary"><div><b>{timeline.length}</b><span>รายการ Active วันนี้</span></div><div><b>{timeline.filter(session => session.status === "Active").length}</b><span>กำลังทำงาน</span></div><div><b>{timeline.filter(session => session.status === "Completed").length}</b><span>จบแล้ว</span></div></div><div className="m3-daily-board"><div className="m3-daily-board-head"><span>วันที่ {dateLabel}</span>{DAILY_TIME_SLOTS.map(slot => <b key={slot} className={bySlot[slot].length ? "has-data" : undefined}>{slot}</b>)}</div><div className="m3-daily-board-grid">{DAILY_TIME_SLOTS.map(slot => <div className="m3-daily-board-column" key={slot}><div className="m3-daily-board-slot">{bySlot[slot].map(session => <SupervisorDailyActiveCard key={session.sessionId} session={session} members={members} onOpen={() => onOpenSession(session)} />)}</div></div>)}</div>{!timeline.length && <p className="m3-empty">ยังไม่มีรายการที่เริ่ม Active ในวันนี้</p>}</div>{notice && <p className="m3-notice">{notice}</p>}</section>;
}

export default function SupervisorModule() {
  const [tab, setTab] = useState<SupervisorTab>(() => {
    if (typeof window === "undefined") return "database";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return requested === "dashboard" || requested === "issues" || requested === "communication" || requested === "settings" || requested === "queuePayout" || requested === "database" ? requested : "database";
  });
  const [snapshot, setSnapshot] = useState<SupervisorSnapshot>(EMPTY_SUPERVISOR_SNAPSHOT);
  const [isFleetSnapshotHydrated, setIsFleetSnapshotHydrated] = useState(false);
  const [isGuideSessionsSnapshotHydrated, setIsGuideSessionsSnapshotHydrated] = useState(false);
  const [safetyNotices, setSafetyNotices] = useState<VehicleSafetyNotice[]>([]);
  const [selectedSafetyNotices, setSelectedSafetyNotices] = useState<VehicleSafetyNotice[]>([]);
  const [notice, setNotice] = useState("");
  const [selectedGuideSessionId, setSelectedGuideSessionId] = useState<string>();
  const [supervisorCompletionPrompt, setSupervisorCompletionPrompt] = useState<ActiveCompletionPrompt | null>(null);
  const [supervisorDetailAction, setSupervisorDetailAction] = useState<SupervisorDetailAction>(null);
  const [supervisorChatText, setSupervisorChatText] = useState("");
  const [supervisorReplaceFromId, setSupervisorReplaceFromId] = useState("");
  const [supervisorReplaceToId, setSupervisorReplaceToId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [dataTab, setDataTab] = useState<DataTab>("users");
  const [queuePayoutView, setQueuePayoutView] = useState<"daily" | "payout">("daily");
  const [showAddUser, setShowAddUser] = useState(false);
  const [showSupervisorStandbyCreator, setShowSupervisorStandbyCreator] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserCode, setNewUserCode] = useState("");
  const [newUserGroup, setNewUserGroup] = useState<string>(SUPERVISOR_USER_GROUPS[0]);
  const [userFormError, setUserFormError] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [newVehicleCc, setNewVehicleCc] = useState<"200" | "250">("200");
  const [vehicleFormError, setVehicleFormError] = useState("");
  const [showCreateFleetGroup, setShowCreateFleetGroup] = useState(false);
  const [newFleetGroupName, setNewFleetGroupName] = useState("");
  const [selectedFleetVehicles, setSelectedFleetVehicles] = useState<number[]>([]);
  const [selectedFleetManagers, setSelectedFleetManagers] = useState<number[]>([]);
  const [newFleetGroupColor, setNewFleetGroupColor] = useState("#81e597");
  const [editingFleetGroupId, setEditingFleetGroupId] = useState<string | null>(null);
  const [fleetGroupError, setFleetGroupError] = useState("");
  const fleetVehicleOptions = useMemo(() => availableVehiclesForFleetGroup(snapshot.vehicleDatabase, snapshot.fleetGroups, editingFleetGroupId ?? undefined), [snapshot.vehicleDatabase, snapshot.fleetGroups, editingFleetGroupId]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "user" | "vehicle" | "group"; id: string | number; label: string } | null>(null);
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const directoryMeQuery = trpc.directory.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const currentSupervisorActor = { id: directoryMeQuery.data?.id ? String(directoryMeQuery.data.id) : undefined, name: directoryMeQuery.data?.name ?? "หัวหน้า" };
  const directoryQuery = useCanonicalAppDirectory();
  const fleetSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.fleet }, { retry: false, refetchInterval: 3000 });
  const guideSessionsQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions }, { retry: false, refetchInterval: 1000 });
  const guideStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideState }, { retry: false, refetchInterval: 1000 });
  const vehicleFlowSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow }, { retry: false, refetchInterval: 3000 });
  const mechanicStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.mechanicState }, { retry: false, refetchInterval: 1000 });
  const saveFleetSnapshotMutation = trpc.operationsSnapshots.save.useMutation();
  const saveGuideSessionsMutation = trpc.operationsSnapshots.merge.useMutation();
  const appendGuideMessageMutation = trpc.operationsSnapshots.append.useMutation();
  const sessionMessageMigrationAttempted = useRef(false);
  const directorySync = trpc.directory.sync.useMutation({
    onSuccess: users => {
      setSnapshot(current => ({ ...current, directoryUsers: users }));
      setNotice("ซิงก์รายชื่อผู้ใช้งานเข้าฐานข้อมูลกลางแล้ว");
    },
    onError: () => setNotice("บันทึกรายชื่อผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่"),
  });
  useEffect(() => {
    if (!vehicleFlowSnapshotQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<VehicleFlowSnapshot>(vehicleFlowSnapshotQuery.data);
    if (Array.isArray(remote?.safetyNotices)) {
      // Mechanic warning tab 2 is authoritative for Supervisor guidance counts.
      const nextSafetyNotices = mergeVehicleSafetyNotices([], remote.safetyNotices);
      setSafetyNotices(current => JSON.stringify(current) === JSON.stringify(nextSafetyNotices) ? current : nextSafetyNotices);
    }
    // Safety notices remain transported through vehicleFlow for compatibility.
    // Pickup is owned by the Supervisor Database fleet snapshot below.
  }, [vehicleFlowSnapshotQuery.data, vehicleFlowSnapshotQuery.isSuccess]);

  useEffect(() => {
    if (!fleetSnapshotQuery.isSuccess || isFleetSnapshotHydrated) return;
    const remote = parseOperationsSnapshot<Partial<SupervisorSnapshot>>(fleetSnapshotQuery.data);
    if (remote?.vehicleDatabase && remote.fleetGroups && remote.vehicleState) {
      setSnapshot(current => ({ ...current, vehicleDatabase: remote.vehicleDatabase as VehicleRecord[], fleetGroups: remote.fleetGroups as FleetGroup[], vehicleState: remote.vehicleState as VehicleResponsibilityState, usageHours: Array.isArray(remote.usageHours) ? remote.usageHours as SupervisorUsageHours[] : current.usageHours }));
    }
    if (Array.isArray(remote?.pickupRequests)) {
      const nextPickupRequests = mergeVehiclePickupRequests([], remote.pickupRequests);
      // Pickup requests are persisted by the Supervisor fleet snapshot mutation only.
      setSnapshot(current => JSON.stringify(current.pickupRequests) === JSON.stringify(nextPickupRequests) ? current : { ...current, pickupRequests: nextPickupRequests });
    }
    setIsFleetSnapshotHydrated(true);
  }, [fleetSnapshotQuery.data, fleetSnapshotQuery.isSuccess, isFleetSnapshotHydrated]);
  useEffect(() => {
    if (!mechanicStateQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<MechanicState>(mechanicStateQuery.data);
    if (remote && (Array.isArray(remote.alerts) || Array.isArray(remote.repairs))) {
      setSnapshot(current => ({ ...current, mechanicState: remote }));
    }
  }, [mechanicStateQuery.data, mechanicStateQuery.isSuccess]);
  useEffect(() => {
    if (!guideSessionsQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ sessions?: unknown[]; messages?: unknown[]; repairReports?: unknown[] }>(guideSessionsQuery.data);
    const localGuideState = snapshot.guideState;
    const nextGuideState: GuideState = { ...localGuideState };
    let changed = false;
    if (Array.isArray(remote?.sessions)) {
      const remoteSessions = normalizeSupervisorGuideSessions(remote.sessions);
      if (JSON.stringify(localGuideState.sessions ?? []) !== JSON.stringify(remoteSessions)) {
        nextGuideState.sessions = remoteSessions;
        changed = true;
      }
    }
    if (Array.isArray(remote?.messages)) {
      const merged = mergeSessionChatMessages([], remote.messages);
      if (JSON.stringify(localGuideState.messages ?? []) !== JSON.stringify(merged)) {
        nextGuideState.messages = merged;
        changed = true;
      }
    }
    if (Array.isArray(remote?.repairReports)) {
      const mergedReports = mergeGuideRepairReports([], remote.repairReports as GuideRepairReport[]);
      if (JSON.stringify(localGuideState.repairReports ?? []) !== JSON.stringify(mergedReports)) {
        nextGuideState.repairReports = mergedReports;
        changed = true;
      }
    }
    if (changed) {
      setSnapshot(current => ({ ...current, guideState: nextGuideState }));
    }
    setIsGuideSessionsSnapshotHydrated(true);
  }, [guideSessionsQuery.data, guideSessionsQuery.isSuccess]);
  useEffect(() => {
    if (!guideStateQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ payoutRoundValues?: PersonalPayoutValues }>(guideStateQuery.data);
    if (remote?.payoutRoundValues && typeof remote.payoutRoundValues === "object") {
      setSnapshot(current => ({ ...current, guideState: { ...current.guideState, payoutRoundValues: remote.payoutRoundValues } }));
    }
  }, [guideStateQuery.data, guideStateQuery.isSuccess]);
  useEffect(() => {
    if (!isFleetSnapshotHydrated) return;
    const usageHours = summarizeVehicleUsageHours(
      Array.isArray(snapshot.guideState.sessions) ? snapshot.guideState.sessions as Array<Parameters<typeof summarizeVehicleUsageHours>[0][number]> : [],
      snapshot.vehicleDatabase.map(vehicle => ({ id: `m3-v${vehicle.number}`, number: String(vehicle.number), cc: vehicle.cc })),
    );
    saveFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ vehicleDatabase: snapshot.vehicleDatabase, fleetGroups: snapshot.fleetGroups, vehicleState: snapshot.vehicleState, usageHours, pickupRequests: snapshot.pickupRequests }) });
  }, [isFleetSnapshotHydrated, snapshot.vehicleDatabase, snapshot.fleetGroups, snapshot.vehicleState, snapshot.guideState.sessions, snapshot.pickupRequests]);

  useEffect(() => {
    if (!directoryQuery.isSuccess) return;
    if (directoryQuery.users.length) {
      const users = directoryQuery.users as DirectoryUser[];
      setSnapshot(current => ({ ...current, directoryUsers: users }));
      return;
    }

  }, [directoryQuery.isSuccess, directoryQuery.users]);


  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => {
      void fleetSnapshotQuery.refetch();
      void guideSessionsQuery.refetch();
      void guideStateQuery.refetch();
      void vehicleFlowSnapshotQuery.refetch();
      void directoryQuery.refetch();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  const canonicalSupervisorStatusModel = useMemo(() => {
    const currentGuideSessions = normalizeSupervisorGuideSessions(snapshot.guideState.sessions);
    return buildSupervisorUserDirectoryStatusModel(buildSupervisorUserDirectoryStatusSource({
      vehicleDatabase: snapshot.vehicleDatabase,
      vehicleState: snapshot.vehicleState,
      guideReports: snapshot.guideState.repairReports,
      mechanicRepairs: snapshot.mechanicState.repairs,
      guidanceVehicleNumbers: safetyNotices.map(notice => notice.vehicleNumber),
      pickupVehicleNumbers: snapshot.pickupRequests.filter(request => request.status === "รอรับรถ").map(request => request.vehicleNumber),
      activeVehicleNumbers: currentGuideSessions.filter(session => session.status === "Active").flatMap(session => (session.vehicleIds ?? []).map(id => Number(String(id).replace(/^m3-v/, "")))),
    }));
  }, [snapshot, safetyNotices]);
  const vehicles = useMemo<VehicleRow[]>(() => {
    return snapshot.vehicleDatabase.map(record => {
      const fleetGroup = snapshot.fleetGroups.find(group => group.vehicleNumbers.includes(record.number));
      const fallbackManagers = fleetGroup?.managerIds.map(id => snapshot.directoryUsers.find(user => String(user.id) === String(id))?.name ?? `#${id}`) ?? [];
      const responsibility = resolveVehicleResponsibilityView(record.number, snapshot.vehicleState.responsibilityGroups, snapshot.directoryUsers, fallbackManagers, fleetGroup?.color || "#81e597");
      const status = canonicalSupervisorStatusModel.numbers.inspection.has(record.number) && canonicalSupervisorStatusModel.numbers.ready.has(record.number)
        ? "inspection" as const
        : resolveSupervisorOperationalStatus(record.number, canonicalSupervisorStatusModel.numbers);
      return { number: record.number, cc: record.cc, status, group: responsibility.groupLabel, manager: responsibility.managerLabel, color: responsibility.color };
    }).sort((a, b) => a.number - b.number);
  }, [snapshot, canonicalSupervisorStatusModel]);

  const vehiclesByCc = useMemo(() => (["200", "250"] as const).map(cc => ({ cc, rows: vehicles.filter(vehicle => vehicle.cc === cc) })), [vehicles]);
  const unassignedFleetVehicles = useMemo(() => {
    const numbers = new Set(getUnassignedVehicleNumbers(snapshot.vehicleState.vehicleGroups, snapshot.vehicleState.responsibilityGroups));
    return snapshot.vehicleDatabase.filter(vehicle => numbers.has(vehicle.number)).sort((a, b) => a.number - b.number);
  }, [snapshot.vehicleDatabase, snapshot.vehicleState]);
  const managerOptions = useMemo(() => {
    const candidates = getSupervisorManagerOptions(snapshot.directoryUsers);
    const availableIds = new Set(availableManagersForFleetGroup(candidates.map(user => user.id), snapshot.fleetGroups, editingFleetGroupId ?? undefined));
    return candidates.filter(user => availableIds.has(user.id));
  }, [snapshot.directoryUsers, snapshot.fleetGroups, editingFleetGroupId]);
  const accumulatedVehicleHours = useMemo(() => summarizeVehicleUsageHours(
    Array.isArray(snapshot.guideState.sessions) ? snapshot.guideState.sessions as Array<Parameters<typeof summarizeVehicleUsageHours>[0][number]> : [],
    snapshot.vehicleDatabase.map(vehicle => ({ id: `m3-v${vehicle.number}`, number: String(vehicle.number), cc: vehicle.cc as "200" | "250" })),
  ), [snapshot.guideState.sessions, snapshot.vehicleDatabase]);
  const accumulatedHoursByCc = useMemo(() => (["200", "250"] as const).map(cc => ({ cc, rows: accumulatedVehicleHours.filter(vehicle => vehicle.cc === cc) })), [accumulatedVehicleHours]);
  const guideSessions = useMemo(() => normalizeSupervisorGuideSessions(snapshot.guideState.sessions), [snapshot.guideState.sessions]);
  const guideMembers = useMemo(() => {
    const storedMembers = normalizeSupervisorGuideMembers(snapshot.guideState.members);
    if (storedMembers.length) return storedMembers;
    return snapshot.directoryUsers
      .filter(user => user.group?.includes("ไกด์") || user.group?.includes("ช่าง"))
      .map(user => ({ id: String(user.id), name: user.name }));
  }, [snapshot.directoryUsers, snapshot.guideState.members]);
  const guideActiveSessions = useMemo(() => guideSessions.filter(session => session.status === "Active"), [guideSessions]);
  const guideStandbySessions = useMemo(() => guideSessions.filter(session => session.status === "Standby"), [guideSessions]);
  // This model is the same live plug consumed by Supervisor > Database > Users,
  // the Supervisor homepage card, and the shared inner Group View door.
  const supervisorStatusModel = canonicalSupervisorStatusModel;
  // 2.1 must use the same canonical Supervisor Database status model as the dashboard.
  // The existing vehicles rows are used only for group/manager presentation metadata.
  const supervisorStandbyVehicles = useMemo(() => buildSupervisorInputVehicles(supervisorStatusModel).map(vehicle => {
    const row = vehicles.find(candidate => candidate.number === vehicle.number);
    return {
      ...vehicle,
      group: row?.group,
      manager: row?.manager,
      color: row?.color,
    };
  }), [supervisorStatusModel, vehicles]);
  const databaseStatusSummary = supervisorStatusModel.summary;
  const guideDailyTimeline = useMemo(() => buildDailyActiveTimeline(guideSessions), [guideSessions]);
  const guideDailyBySlot = useMemo(() => groupDailyActiveTimelineBySlot(guideSessions), [guideSessions]);

  const currentDirectoryUsers = (directoryQuery.users.length ? directoryQuery.users : snapshot.directoryUsers) as DirectoryUser[];
  const userGroups = useMemo(() => {
    const groups = new Map<string, DirectoryUser[]>(SUPERVISOR_USER_GROUPS.map(group => [group, []]));
    currentDirectoryUsers.forEach(user => {
      const group = supervisorGroupLabel(user.group);
      groups.set(group, [...(groups.get(group) ?? []), user]);
    });
    return Array.from(groups.entries());
  }, [currentDirectoryUsers]);

  const selectDataTab = (nextTab: DataTab) => {
    setTab("database");
    setDataTab(nextTab);
    setNotice("");
  };

  const saveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let nextUsers: DirectoryUser[];
    if (editingUser) {
      const result = updateSupervisorUser(currentDirectoryUsers, editingUser.id, newUserName, newUserCode, newUserGroup);
      if (result.error) { setUserFormError(result.error); return; }
      nextUsers = result.users;
      setNotice(`แก้ไขข้อมูล ${newUserName} แล้ว`);
    } else {
      const result = addSupervisorUser(currentDirectoryUsers, newUserName, newUserCode, newUserGroup);
      if (result.error) {
        setUserFormError(result.error);
        return;
      }
      nextUsers = result.users;
      setNotice(`เพิ่มผู้ใช้งาน ${newUserName} แล้ว`);
    }
    // addSupervisorUser uses a client-only id for optimistic rendering. Do not
    // send that id for a new row; MySQL must allocate the real AUTO_INCREMENT id.
    const existingIds = new Set(currentDirectoryUsers.map(user => user.id));
    directorySync.mutate({ users: nextUsers.map(user => ({ id: existingIds.has(user.id) ? user.id : undefined, name: user.name, code: user.code ?? "", group: user.group ?? "" })) });
    setSnapshot(current => ({ ...current, directoryUsers: nextUsers }));
    setNewUserName("");
    setNewUserCode("");
    setNewUserGroup(SUPERVISOR_USER_GROUPS[0]);
    setEditingUser(null);
    setUserFormError("");
    setShowAddUser(false);
  };

  const saveVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingVehicle) {
      const number = Number(newVehicleNumber.trim());
      if (isNaN(number) || number <= 0) { setVehicleFormError("กรุณากรอกเบอร์รถที่ถูกต้อง"); return; }
      if (number !== editingVehicle.number && snapshot.vehicleDatabase.some(v => v.number === number)) { setVehicleFormError("เบอร์รถนี้มีอยู่แล้ว"); return; }

      const nextState = persistCanonicalVehicleState(updateVehicleInResponsibilityState(snapshot.vehicleState, editingVehicle.number, number, newVehicleCc));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`แก้ไขเบอร์รถ #${editingVehicle.number} เป็น #${number} แล้ว`);
    } else {
      const result = addSupervisorVehicle(snapshot.vehicleDatabase, newVehicleNumber, newVehicleCc);
      if (result.error) {
        setVehicleFormError(result.error);
        return;
      }
      const nextState = persistCanonicalVehicleState(addVehicleToResponsibilityState(snapshot.vehicleState, Number(newVehicleNumber.trim()), newVehicleCc));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`เพิ่มเบอร์รถ #${newVehicleNumber} แล้ว`);
    }
    setNewVehicleNumber("");
    setNewVehicleCc("200");
    setEditingVehicle(null);
    setVehicleFormError("");
    setShowAddVehicle(false);
  };

  const toggleFleetVehicle = (number: number) => {
    setSelectedFleetVehicles(current => current.includes(number) ? current.filter(item => item !== number) : [...current, number]);
  };

  const toggleFleetManager = (id: number) => {
    setSelectedFleetManagers(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 2 ? current : [...current, id]);
  };

  const saveFleetGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingFleetGroupId) {
      const result = updateSupervisorFleetGroup(snapshot.fleetGroups, editingFleetGroupId, newFleetGroupName, selectedFleetVehicles, selectedFleetManagers, newFleetGroupColor);
      if (result.error) {
        setFleetGroupError(result.error);
        return;
      }
      const nextState = persistCanonicalVehicleState(updateResponsibilityGroupInState(snapshot.vehicleState, editingFleetGroupId, {
        name: newFleetGroupName,
        managers: selectedFleetManagers,
        vehicleNumbers: selectedFleetVehicles,
        color: newFleetGroupColor,
      }));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`แก้ไขกลุ่ม ${newFleetGroupName} แล้ว`);
    } else {
      const id = `fleet-${Date.now().toString(36)}`;
      const result = addSupervisorFleetGroup(snapshot.fleetGroups, newFleetGroupName, selectedFleetVehicles, selectedFleetManagers, id, newFleetGroupColor);
      if (result.error) {
        setFleetGroupError(result.error);
        return;
      }
      const nextState = persistCanonicalVehicleState(addResponsibilityGroupToState(snapshot.vehicleState, {
        id,
        name: newFleetGroupName,
        managers: selectedFleetManagers,
        vehicleNumbers: selectedFleetVehicles,
        color: newFleetGroupColor,
      }));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`สร้างกลุ่ม ${newFleetGroupName} แล้ว`);
    }
    setNewFleetGroupName("");
    setSelectedFleetVehicles([]);
    setSelectedFleetManagers([]);
    setNewFleetGroupColor("#81e597");
    setEditingFleetGroupId(null);
    setFleetGroupError("");
    setShowCreateFleetGroup(false);
  };

  const editFleetGroup = (group: FleetGroup) => {
    setEditingFleetGroupId(group.id);
    setNewFleetGroupName(group.name);
    setSelectedFleetVehicles(group.vehicleNumbers);
    setSelectedFleetManagers(group.managerIds);
    setNewFleetGroupColor(group.color || "#81e597");
    setFleetGroupError("");
    setShowCreateFleetGroup(true);
  };

  const confirmDelete = (type: "user" | "vehicle" | "group", id: string | number, label: string) => {
    setDeleteConfirm({ type, id, label });
  };

  const executeDelete = () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    if (type === "group") {
      const nextState = persistCanonicalVehicleState(removeResponsibilityGroupFromState(snapshot.vehicleState, id));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`ลบกลุ่ม ${deleteConfirm.label} แล้ว`);
    } else if (type === "vehicle") {
      const nextState = persistCanonicalVehicleState(removeVehicleFromResponsibilityState(snapshot.vehicleState, Number(id)));
      setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`ลบรถ #${id} ออกจากฐานข้อมูลแล้ว`);
    } else if (type === "user") {
      const userId = Number(id);
      const nextUsers = currentDirectoryUsers.filter(user => user.id !== userId);
      const nextState = persistCanonicalVehicleState(removeManagerFromResponsibilityState(snapshot.vehicleState, userId));
      directorySync.mutate({ users: nextUsers.map(user => ({ id: user.id, name: user.name, code: user.code ?? "", group: user.group ?? "" })) });
      setSnapshot(current => ({ ...current, directoryUsers: nextUsers, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
      setNotice(`ลบผู้ใช้งาน ${deleteConfirm.label} แล้ว`);
    }
    setDeleteConfirm(null);
  };

  const startEditUser = (user: DirectoryUser) => {
    setEditingUser(user);
    setNewUserName(user.name);
    setNewUserCode(user.code ?? "");
    setNewUserGroup(user.group ?? SUPERVISOR_USER_GROUPS[0]);
    setUserFormError("");
    setShowAddUser(true);
  };

  const startEditVehicle = (vehicle: VehicleRecord) => {
    setEditingVehicle(vehicle);
    setNewVehicleNumber(String(vehicle.number));
    setNewVehicleCc(vehicle.cc);
    setVehicleFormError("");
    setShowAddVehicle(true);
  };

  const selectTab = (nextTab: SupervisorTab) => {
    setTab(nextTab);
    if (nextTab === "dashboard" || nextTab === "issues" || nextTab === "communication" || nextTab === "queuePayout" || nextTab === "database") {
      setNotice("");
      return;
    }
    setNotice("ส่วนนี้ใช้เป็นทางลัดของโมดูลหัวหน้า และจะแสดงข้อมูลร่วมในขั้นถัดไป");
  };

  const topNav: Array<{ id: SupervisorTab; label: string; icon: typeof Database }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "queuePayout", label: "หน้าคิวและตารางค่ารอบ", icon: CalendarDays },
    { id: "communication", label: "ห้องสื่อสาร", icon: MessageCircle },
    { id: "database", label: "ฐานข้อมูล", icon: Database },
  ];
  const selectedGuideSession = findSupervisorGuideSession(guideSessions, selectedGuideSessionId);
  const selectedSupervisorTiming = selectedGuideSession?.status === "Active"
    ? supervisorActiveTimeLabel(selectedGuideSession.startedAt, selectedGuideSession.durationMinutes, now)
    : undefined;
  useEffect(() => {
    if (selectedGuideSession?.status !== "Active" || !selectedGuideSession.startedAt || selectedGuideSession.overtimeAcknowledged || !selectedSupervisorTiming || selectedSupervisorTiming.overtimeSeconds <= 0) return;
    setSupervisorCompletionPrompt(current => isActiveCompletionPromptFor(current, selectedGuideSession.sessionId) ? current : createActiveCompletionPrompt(selectedGuideSession.sessionId, "expired"));
  }, [selectedGuideSession?.sessionId, selectedGuideSession?.status, selectedGuideSession?.startedAt, selectedGuideSession?.overtimeAcknowledged, selectedSupervisorTiming?.overtimeSeconds]);
  const openGuideSession = (session: SupervisorGuideSession) => { setSelectedGuideSessionId(session.sessionId); setSupervisorCompletionPrompt(null); setSupervisorDetailAction(null); setNotice(""); };
  const closeGuideSession = () => { setSelectedGuideSessionId(undefined); setSupervisorCompletionPrompt(null); setSupervisorDetailAction(null); setNotice(""); };
  const openSafetyNotices = (notices: VehicleSafetyNotice[]) => setSelectedSafetyNotices(notices);
  const safetyNoticeDialog = <VehicleSafetyNoticeDialog notices={selectedSafetyNotices} onClose={() => setSelectedSafetyNotices([])} />;
  const supervisorSessionMessages: ActiveSessionChatMessage[] = selectedGuideSession ? ((snapshot.guideState.messages ?? []) as ActiveSessionChatMessage[]).filter(message => message.sessionId === selectedGuideSession.sessionId) : [];
  const sendSupervisorSessionMessage = () => {
    if (!selectedGuideSession || !supervisorChatText.trim()) return;
    const guideState = snapshot.guideState;
    const messages = Array.isArray(guideState.messages) ? guideState.messages : [];
    const message = { id: `supervisor-${Date.now()}`, sessionId: selectedGuideSession.sessionId, sender: currentSupervisorActor.name, text: supervisorChatText.trim(), createdAt: new Date().toISOString() };
    appendGuideMessageMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, field: "messages", item: JSON.stringify(message), maxItems: 500 });
    setSupervisorChatText("");
  };
  const patchGuideSessionFromSupervisor = (sessionId: string, patch: Record<string, unknown>) => {
    const guideState = snapshot.guideState;
    const sessions = Array.isArray(guideState.sessions) ? guideState.sessions : [];
    const nextSessions = sessions.map(item => {
      if (!item || typeof item !== "object" || (item as { sessionId?: unknown }).sessionId !== sessionId) return item;
      return { ...(item as Record<string, unknown>), ...patch };
    });
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ sessions: nextSessions, messages: guideState.messages, repairReports: guideState.repairReports }) });
  };
  const requestCompleteGuideSessionFromSupervisor = () => {
    if (!selectedGuideSession || selectedGuideSession.status === "Completed") return;
    setSupervisorCompletionPrompt(createActiveCompletionPrompt(selectedGuideSession.sessionId));
  };
  const supervisorRoundTableUsers = useMemo(() => filterSupervisorRoundTableUsers(snapshot.directoryUsers), [snapshot.directoryUsers]);
  const supervisorBusyVehicleIds = useMemo(() => new Set(guideSessions.filter(session => session.status !== "Completed").flatMap(session => session.vehicleIds)), [guideSessions]);
  const supervisorBusyMemberIds = useMemo(() => new Set(guideSessions.filter(session => session.status !== "Completed").flatMap(session => session.memberIds)), [guideSessions]);
  const supervisorAvailableMembers = selectedGuideSession ? guideMembers.filter(member => !selectedGuideSession.memberIds.includes(member.id) && !supervisorBusyMemberIds.has(member.id)) : [];
  const supervisorReplacementNumbers = availableReplacementVehicleNumbers(vehicles, guideSessions, selectedGuideSession?.sessionId);
  const supervisorAvailableVehicles = selectedGuideSession ? vehicles.filter(vehicle => supervisorReplacementNumbers.has(vehicle.number) && !selectedGuideSession.vehicleIds.includes(`m3-v${vehicle.number}`)) : [];
  const updateSupervisorVehicleStatus = (vehicleIds: string[], status: "ready" | "active") => {
    const numbers = vehicleIds.map(id => Number(id.replace(/^m3-v/, ""))).filter(number => Number.isInteger(number) && number > 0);
    if (!numbers.length) return;
    const nextState = persistCanonicalVehicleState(setVehicleStatusForNumbers(snapshot.vehicleState, numbers, status));
    setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
  };
  const addSupervisorMember = (memberId: string) => {
    if (!selectedGuideSession || !supervisorAvailableMembers.some(member => member.id === memberId)) return;
    patchGuideSessionFromSupervisor(selectedGuideSession.sessionId, { memberIds: Array.from(new Set([...selectedGuideSession.memberIds, memberId])) });
    setSupervisorDetailAction(null);
  };
  const addVehicleToSupervisorSession = (vehicleId: string) => {
    if (!selectedGuideSession || !supervisorAvailableVehicles.some(vehicle => `m3-v${vehicle.number}` === vehicleId)) return;
    patchGuideSessionFromSupervisor(selectedGuideSession.sessionId, { vehicleIds: Array.from(new Set([...selectedGuideSession.vehicleIds, vehicleId])) });
    updateSupervisorVehicleStatus([vehicleId], "active");
    setSupervisorDetailAction(null);
  };
  const removeSupervisorVehicle = (vehicleId: string) => {
    if (!selectedGuideSession || selectedGuideSession.vehicleIds.length <= 1 || !selectedGuideSession.vehicleIds.includes(vehicleId)) return;
    patchGuideSessionFromSupervisor(selectedGuideSession.sessionId, { vehicleIds: selectedGuideSession.vehicleIds.filter(id => id !== vehicleId) });
    updateSupervisorVehicleStatus([vehicleId], "ready");
    setSupervisorDetailAction(null);
  };
  const replaceSupervisorVehicle = (vehicleId: string, fromId = selectedGuideSession?.vehicleIds[0]) => {
    if (!selectedGuideSession || !fromId || !selectedGuideSession.vehicleIds.length || !supervisorAvailableVehicles.some(vehicle => `m3-v${vehicle.number}` === vehicleId)) return;
    const oldId = fromId;
    patchGuideSessionFromSupervisor(selectedGuideSession.sessionId, { vehicleIds: selectedGuideSession.vehicleIds.map(id => id === fromId ? vehicleId : id) });
    const afterOldVehicle = setVehicleStatusForNumbers(snapshot.vehicleState, [Number(oldId.replace(/^m3-v/, ""))], "ready");
    const afterReplacement = setVehicleStatusForNumbers(afterOldVehicle, [Number(vehicleId.replace(/^m3-v/, ""))], "active");
    const nextState = persistCanonicalVehicleState(afterReplacement);
    setSnapshot(current => ({ ...current, vehicleState: nextState, vehicleDatabase: vehicleRecordsFromState(nextState), fleetGroups: fleetGroupsFromState(nextState) }));
    setSupervisorReplaceFromId("");
    setSupervisorReplaceToId("");
    setSupervisorDetailAction(null);
  };
  const keepGuideSessionOpenAfterExpiry = () => {
    if (!selectedGuideSession || !isActiveCompletionPromptFor(supervisorCompletionPrompt, selectedGuideSession.sessionId)) return;
    patchGuideSessionFromSupervisor(selectedGuideSession.sessionId, { overtimeAcknowledged: true });
    setSupervisorCompletionPrompt(null);
    setNotice(`รายการ ${selectedGuideSession.sessionId} ยังไม่จบ ระบบจะนับเวลาบวกต่อ`);
  };
  const completeGuideSessionFromSupervisor = () => {
    if (!selectedGuideSession || !isActiveCompletionPromptFor(supervisorCompletionPrompt, selectedGuideSession.sessionId)) return;
    const sessionId = selectedGuideSession.sessionId;
    const completedAt = new Date().toISOString();
    const completionTiming = sessionCompletionTiming(selectedGuideSession.startedAt, completedAt, selectedGuideSession.durationMinutes);
    const currentGuideState = snapshot.guideState;
    const sourceSession = (Array.isArray(currentGuideState.sessions) ? currentGuideState.sessions : []).find(item => Boolean(item && typeof item === "object" && (item as { sessionId?: unknown }).sessionId === sessionId)) as { activityLog?: SessionActivity[] } | undefined;
    const activity = createSessionActivity({ actorId: currentSupervisorActor.id, actorName: currentSupervisorActor.name, action: "จบงาน → Completed", detail: `${completionTimingDetail(completionTiming)} · ใช้เวลาจริง ${formatCompletionDifference(completionTiming.actualSeconds)}`, createdAt: completedAt });
    patchGuideSessionFromSupervisor(sessionId, { status: "Completed", completedAt, completedById: currentSupervisorActor.id, completedByName: currentSupervisorActor.name, overtimeAcknowledged: true, completionTiming, activityLog: appendSessionActivity(sourceSession?.activityLog, activity) });
    updateSupervisorVehicleStatus(selectedGuideSession.vehicleIds, "ready");
    setSupervisorCompletionPrompt(null);
    setSelectedGuideSessionId(undefined);
    setNotice(`จบรายการ ${sessionId} แล้ว`);
  };
  const supervisorRemoveVehicleOptions = selectedGuideSession ? selectedGuideSession.vehicleIds.flatMap(vehicleId => {
    const vehicle = vehicles.find(candidate => candidate.number === Number(vehicleId.replace(/^m3-v/, "")));
    return vehicle ? [vehicle] : [];
  }) : [];
  const supervisorCurrentVehicleItems: VehicleChoiceItem[] = supervisorRemoveVehicleOptions.map(vehicle => ({
    id: `m3-v${Number(vehicle.number)}`,
    number: Number(vehicle.number),
    cc: vehicle.cc,
    statusLabel: "อยู่ใน Active",
    fallbackGroupLabel: vehicle.group,
    fallbackManagers: vehicle.manager ? vehicle.manager.split(" · ") : [],
    accentColor: vehicle.color || getResponsibilityGroupColor(Number(vehicle.number), snapshot.vehicleState.responsibilityGroups),
    disabled: Boolean(selectedGuideSession && selectedGuideSession.vehicleIds.length <= 1),
    disabledReason: "ต้องเหลือรถใน Active อย่างน้อย 1 คัน",
    safetyNotices,
  }));
  const supervisorReplacementItems: VehicleChoiceItem[] = supervisorAvailableVehicles.map(vehicle => ({
    id: `m3-v${Number(vehicle.number)}`,
    number: Number(vehicle.number),
    cc: vehicle.cc,
    statusLabel: "พร้อมใช้",
    fallbackGroupLabel: vehicle.group,
    fallbackManagers: vehicle.manager ? vehicle.manager.split(" · ") : [],
    accentColor: vehicle.color || getResponsibilityGroupColor(Number(vehicle.number), snapshot.vehicleState.responsibilityGroups),
    safetyNotices,
  }));
  const supervisorChoiceVehicles = supervisorDetailAction === "removeVehicle" ? supervisorRemoveVehicleOptions : supervisorAvailableVehicles;
  const supervisorChoiceItems: VehicleChoiceItem[] = supervisorChoiceVehicles.map(vehicle => {
    const number = Number(vehicle.number);
    return {
      id: `m3-v${number}`,
      number,
      cc: vehicle.cc,
      statusLabel: supervisorDetailAction === "removeVehicle" ? "อยู่ใน Active" : "พร้อมใช้",
      fallbackGroupLabel: vehicle.group,
      fallbackManagers: vehicle.manager ? vehicle.manager.split(" · ") : [],
      accentColor: vehicle.color || getResponsibilityGroupColor(number, snapshot.vehicleState.responsibilityGroups),
      disabled: supervisorDetailAction === "removeVehicle" && Boolean(selectedGuideSession && selectedGuideSession.vehicleIds.length <= 1),
      disabledReason: "ต้องเหลือรถใน Active อย่างน้อย 1 คัน",
      safetyNotices,
    };
  });
  const supervisorSessionDetail = selectedGuideSession ? <section className="m3-panel supervisor-guide-panel supervisor-session-detail" aria-labelledby="supervisor-session-detail-title">
    <div className="m3-panel-title"><div><p>ACTIVE SESSION / SUPERVISOR VIEW</p><h2 id="supervisor-session-detail-title">กำลังปฏิบัติงาน</h2><small>{selectedGuideSession.sessionId} · {selectedGuideSession.status === "Active" ? "กำลังทำงาน" : selectedGuideSession.status === "Standby" ? "รอเริ่มงาน" : "จบแล้ว"}</small></div><button type="button" className="m3-icon-button" onClick={closeGuideSession} aria-label="กลับหน้า Dashboard"><ArrowLeft size={18} /></button></div>
    {selectedGuideSession.status === "Active" && selectedSupervisorTiming && <div className={`m3-timer ${selectedSupervisorTiming.overtimeSeconds > 0 ? "m3-timer-overtime" : ""}`}><strong>{selectedSupervisorTiming.overtimeSeconds > 0 ? `+${formatSessionCountdown(selectedSupervisorTiming.overtimeSeconds)}` : formatSessionCountdown(selectedSupervisorTiming.remainingSeconds)}</strong><span>{selectedSupervisorTiming.overtimeSeconds > 0 ? "เกินเวลา · รอยืนยันการจบงาน" : `เหลือเวลา · โปรแกรม ${selectedGuideSession.durationMinutes} นาที`}</span></div>}
    <div className="supervisor-session-summary"><div><span>ผู้ทำรายการ</span><strong>{selectedGuideSession.activeUserName || "ไม่ระบุ"}</strong></div><div><span>สมาชิก</span><strong className="m3-member-name-list">{selectedGuideSession.memberIds.map(id => { const member = guideMembers.find(item => item.id === id); return member ? <span className={`m3-member-name ${memberGroupClass(snapshot.directoryUsers.find(user => String(user.id) === String(member.id))?.group)}`} key={member.id}>{member.name}</span> : null; })}</strong></div><div><span>รถในรายการ</span><ActiveVehicleDetailList sessionId={selectedGuideSession.sessionId} vehicles={selectedGuideSession.vehicleIds.map(id => { const number = Number(id.replace(/^m3-v/, "")); const row = vehicles.find(vehicle => vehicle.number === number); return { id, number, cc: `${row?.cc ?? "—"}cc`, managers: resolveVehicleManagerNames(number, snapshot.vehicleState.responsibilityGroups, snapshot.directoryUsers, row?.manager ? row.manager.split(" · ") : []), accentColor: row?.color }; })} activeStaff={selectedGuideSession.memberIds.map(id => guideMembers.find(member => member.id === id)?.name).filter((name): name is string => Boolean(name))} activeRoles={selectedGuideSession.memberIds.map(id => { const user = snapshot.directoryUsers.find(item => String(item.id) === String(id)); return user ? supervisorGroupLabel(user.group) : "ผู้ใช้งาน"; })} safetyNotices={safetyNotices} onSafetyNoticeOpen={openSafetyNotices} responsibilityGroups={snapshot.vehicleState.responsibilityGroups} managerDirectory={snapshot.directoryUsers} /></div><div><span>โปรแกรม</span><strong>{selectedGuideSession.durationMinutes} นาที · R {selectedGuideSession.riderCount} · P {selectedGuideSession.passengerCount}</strong></div>{selectedGuideSession.completedByName && <div><span>ผู้จบรายการ</span><strong>{selectedGuideSession.completedByName}</strong></div>}</div>
    <div className="m3-notice m3-readonly-notice" role="status">โหมด Supervisor · คุณมีสิทธิ์จัดการรายการ Active นี้</div>
    {selectedGuideSession.status !== "Completed" && <div className="m3-action-grid supervisor-active-action-grid"><button type="button" onClick={() => setSupervisorDetailAction("members")}><UsersRound size={15} /> เพิ่มสมาชิก</button><button type="button" onClick={() => setSupervisorDetailAction("addVehicle")}><Plus size={15} /> เพิ่มรถ</button><button type="button" onClick={() => { const fromId = selectedGuideSession?.vehicleIds[0] ?? ""; const replacement = supervisorAvailableVehicles[0]; setSupervisorReplaceFromId(fromId); setSupervisorReplaceToId(replacement ? `m3-v${replacement.number}` : ""); setSupervisorDetailAction("replaceVehicle"); }}><RefreshCw size={15} /> เปลี่ยนรถ</button><button type="button" onClick={() => setSupervisorDetailAction("removeVehicle")}><Truck size={15} /> เอารถออก</button><button type="button" className="m3-primary" onClick={requestCompleteGuideSessionFromSupervisor}><Check size={15} /> จบ/คืนรถ</button></div>}
    {supervisorDetailAction === "members" && <div className="m3-modal-list supervisor-inline-action-list">{supervisorAvailableMembers.length ? supervisorAvailableMembers.map(member => <button type="button" key={member.id} onClick={() => addSupervisorMember(member.id)}><b className={memberGroupClass(snapshot.directoryUsers.find(user => String(user.id) === String(member.id))?.group)}>{member.name}</b><small>เพิ่มเข้า Active</small></button>) : <p className="m3-empty">ไม่มีสมาชิกที่ว่างให้เพิ่ม</p>}</div>}
    {supervisorDetailAction === "replaceVehicle" ? <VehicleReplacementPanel currentItems={supervisorCurrentVehicleItems} replacementItems={supervisorReplacementItems} selectedFromId={supervisorReplaceFromId} selectedToId={supervisorReplaceToId} onFromSelect={setSupervisorReplaceFromId} onToSelect={setSupervisorReplaceToId} onConfirm={() => replaceSupervisorVehicle(supervisorReplaceToId, supervisorReplaceFromId)} responsibilityGroups={snapshot.vehicleState.responsibilityGroups} managerDirectory={snapshot.directoryUsers} onSafetyNoticeOpen={openSafetyNotices} confirmDisabled={!supervisorReplaceFromId || !supervisorReplaceToId} /> : supervisorDetailAction && supervisorDetailAction !== "members" && <VehicleChoiceList items={supervisorChoiceItems} responsibilityGroups={snapshot.vehicleState.responsibilityGroups} managerDirectory={snapshot.directoryUsers} onSafetyNoticeOpen={openSafetyNotices} onSelect={vehicleId => supervisorDetailAction === "removeVehicle" ? removeSupervisorVehicle(vehicleId) : addVehicleToSupervisorSession(vehicleId)} ariaLabel={supervisorDetailAction === "removeVehicle" ? "เลือกรถที่จะนำออกจาก Active" : "เลือกรถเพื่อเพิ่มเข้า Active"} actionLabel={supervisorDetailAction === "removeVehicle" ? "เอาออก" : "เพิ่มรถ"} emptyLabel={supervisorDetailAction === "removeVehicle" ? "ไม่มีรถใน Active" : "ไม่มีรถพร้อมใช้ให้เพิ่ม"} />}
    <ServerActiveSessionChat sessionId={selectedGuideSession.sessionId} module="supervisor" canSend={selectedGuideSession.status === "Active"} />
    <div className="supervisor-session-actions"><button type="button" className="supervisor-refresh" onClick={closeGuideSession}><ArrowLeft size={16} /> กลับหน้าแรก</button></div>
    {notice && <p className="m3-notice">{notice}</p>}
    {supervisorCompletionPrompt && isActiveCompletionPromptFor(supervisorCompletionPrompt, selectedGuideSession.sessionId) && (() => { const copy = activeCompletionCopy(supervisorCompletionPrompt.kind); return <div className="supervisor-modal-backdrop" role="presentation"><section className="supervisor-user-modal supervisor-completion-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-completion-title"><div className="supervisor-modal-heading"><div><p>{copy.eyebrow}</p><h3 id="supervisor-completion-title">{copy.title}</h3></div><button type="button" className="supervisor-modal-close" onClick={() => supervisorCompletionPrompt.kind === "expired" ? keepGuideSessionOpenAfterExpiry() : setSupervisorCompletionPrompt(null)} aria-label="ปิดหน้าต่างยืนยัน">×</button></div><p className="supervisor-completion-message">{copy.message}</p><div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => supervisorCompletionPrompt.kind === "expired" ? keepGuideSessionOpenAfterExpiry() : setSupervisorCompletionPrompt(null)}>{copy.secondary}</button><button type="button" className="supervisor-modal-submit" onClick={completeGuideSessionFromSupervisor}><Check size={15} /> ยืนยัน</button></div></section></div>; })()}
  </section> : null;
  const createSupervisorStandby = (draft: SupervisorStandbyDraft) => {
    const sessionMembers = guideMembers.map(member => ({ id: member.id, name: member.name }));
    const duplicate = findSessionDraftDuplicates({ memberIds: draft.memberIds, vehicleIds: draft.vehicleIds }, sessionMembers);
    if (duplicate.memberNames.length || duplicate.vehicleKeys.length) {
      setNotice(`สร้างรายการไม่ได้: ข้อมูลซ้ำ${duplicate.memberNames.length ? ` ชื่อ ${duplicate.memberNames.join(", ")}` : ""}${duplicate.vehicleKeys.length ? ` รถ #${duplicate.vehicleKeys.join(", #")}` : ""}`);
      return;
    }
    const conflict = findSessionConflict(guideSessions, {
      memberIds: draft.memberIds,
      activeUserName: guideMembers.find(member => String(member.id) === String(draft.activeUserId))?.name,
      vehicleIds: draft.vehicleIds,
    }, sessionMembers);
    if (conflict) {
      setNotice(`${conflict.reason === "member" ? "สมาชิกหรือชื่อผู้ทำรายการ" : "รถที่เลือก"} อยู่ใน ${conflict.session.status === "Active" ? "Active" : "Standby"} ${conflict.session.sessionId} แล้ว สร้างรายการซ้ำไม่ได้`);
      return;
    }
    const createdAt = new Date().toISOString();
    const activeMember = String(draft.activeUserId) === String(currentSupervisorActor.id) ? { name: currentSupervisorActor.name } : guideMembers.find(member => member.id === draft.activeUserId);
    const session = { sessionId: `M3-${createdAt.slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: "Standby" as const, durationMinutes: draft.durationMinutes, vehicleIds: draft.vehicleIds, memberIds: draft.memberIds, activeUserId: draft.activeUserId, activeUserName: activeMember?.name ?? "", createdById: currentSupervisorActor.id, createdByName: currentSupervisorActor.name, riderCount: draft.riderCount, passengerCount: draft.passengerCount, createdAt };
    const guideState = snapshot.guideState;
    const nextSessions = [...(Array.isArray(guideState.sessions) ? guideState.sessions : []), session];
    const nextGuideState = { ...guideState, sessions: nextSessions };
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ sessions: nextSessions, messages: guideState.messages, repairReports: guideState.repairReports }) });
    setSnapshot(current => ({ ...current, guideState: nextGuideState }));
    setShowSupervisorStandbyCreator(false);
    setNotice(`สร้างรายการ ${session.sessionId} เป็น Standby แล้ว`);
  };
  const supervisorGuideDashboard = <SupervisorDashboard vehicles={vehicles} safetyNotices={safetyNotices} statusModel={supervisorStatusModel} activeSessions={guideActiveSessions} standbySessions={guideStandbySessions} members={guideMembers} now={now} notice={notice} onOpenSession={openGuideSession} onOpenQueue={() => { setNotice(""); setShowSupervisorStandbyCreator(true); }} onRefresh={() => { void fleetSnapshotQuery.refetch(); void guideSessionsQuery.refetch(); void guideStateQuery.refetch(); void vehicleFlowSnapshotQuery.refetch(); void directoryQuery.refetch(); }} onOpenStatusView={() => setTab("status")} />;
  const supervisorQueuePayoutTabs = <nav className="m3-daily-tabs m3-alert-tabs" aria-label="เมนูหน้าคิวและตารางค่ารอบ"><button type="button" className={queuePayoutView === "daily" ? "selected" : ""} onClick={() => setQueuePayoutView("daily")}><CalendarDays size={15} /><span>บอร์ดบันทึกรายวัน</span></button><button type="button" className={queuePayoutView === "payout" ? "selected" : ""} onClick={() => setQueuePayoutView("payout")}><Settings2 size={15} /><span>ตารางค่ารอบ</span></button></nav>;
  const supervisorGuideDailyBoard = <><div className="supervisor-queue-hub-heading"><p>QUEUE / DAILY BOARD</p><h2>บอร์ดบันทึกรายวัน</h2><span>คิวตั้งต้นชุดเดียวกับ Guide</span></div><section aria-label="บอร์ดบันทึกรายวัน"><TeamBoardQueueModule
    operatorName={currentSupervisorActor.name}
    rosterNames={Array.from(new Set([...guideActiveSessions, ...guideStandbySessions].flatMap(session => session.memberIds.map(memberId => guideMembers.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)))))}
    memberOptions={snapshot.directoryUsers.filter(user => /ไกด์|ช่าง|guide|mechanic/i.test(user.group ?? "")).map(user => ({ name: user.name, group: user.group }))}
    activeGroups={guideActiveSessions.map(session => ({
      sessionId: session.sessionId,
      memberNames: session.memberIds.map(memberId => guideMembers.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)),
      activeUserName: session.activeUserName,
      startedAt: session.startedAt,
      durationMinutes: session.durationMinutes,
    }))}
  /></section></>;
  const HeroIcon = tab === "database" ? Database : tab === "dashboard" ? LayoutDashboard : tab === "queuePayout" ? CalendarDays : tab === "issues" ? CalendarDays : tab === "communication" ? MessageCircle : tab === "settings" ? Settings2 : BarChart3;
  const heroTitle = tab === "database" ? "ฐานข้อมูล" : topNav.find(item => item.id === tab)?.label ?? (tab === "queuePayout" ? "หน้าคิวและตารางค่ารอบ" : "Supervisor");
  const heroSubtitle = tab === "database" ? "ศูนย์รวมข้อมูลและการปฏิบัติงาน ATV" : tab === "dashboard" ? "ภาพรวมรถ 200/250 ซีซีจากทุกกลุ่ม" : tab === "queuePayout" ? "คิวตั้งต้นและตารางค่ารอบจากข้อมูลชุดเดียวกัน" : tab === "issues" ? "บันทึกการทำงานรายวันร่วมกับ Guide" : tab === "communication" ? "วิทยุสื่อสารสดร่วมกับ Guide และ Mechanic" : "ศูนย์ควบคุมการปฏิบัติงาน ATV";

  return <main className="supervisor-shell">
    <section className="supervisor-app">
      <header className={`supervisor-hero ${tab !== "database" ? "supervisor-operation-hero" : ""}`}>
        <div className="supervisor-hero-copy"><p>ATV GUIDE / SUPERVISOR</p><h1>{heroTitle}</h1><span>{heroSubtitle}</span></div>
        <div className="supervisor-hero-actions"><div className="supervisor-hero-mark" aria-hidden="true"><HeroIcon size={34} /><span>LIVE</span></div><ModuleLogoutButton /></div>
      </header>
      {tab === "database" && <nav className="supervisor-shortcuts" aria-label="เมนูฐานข้อมูลหัวหน้า">
        <button type="button" className={tab === "database" && dataTab === "users" ? "selected" : ""} onClick={() => selectDataTab("users")}><UsersRound size={22} /><span>ผู้ใช้งาน</span></button>
        <button type="button" className={tab === "database" && dataTab === "vehicles" ? "selected" : ""} onClick={() => selectDataTab("vehicles")}><Truck size={22} /><span>ฐานข้อมูลเบอร์รถ</span></button>
        <button type="button" className={tab === "database" && dataTab === "fleet-groups" ? "selected" : ""} onClick={() => selectDataTab("fleet-groups")}><ListChecks size={22} /><span>กลุ่มผู้จัดการ<br />ฝูงรถ</span></button>
        <button type="button" className={tab === "database" && dataTab === "usage-hours" ? "selected" : ""} onClick={() => selectDataTab("usage-hours")}><Clock3 size={22} /><span>ชั่วโมง<br />สะสม</span></button>
        <button type="button" onClick={() => selectTab("settings")}><Languages size={22} /><span>ภาษา</span></button>
      </nav>}

      <section className={`supervisor-content ${tab !== "database" ? "supervisor-operation-content" : ""}`}>
        {safetyNoticeDialog}
        {tab === "database" && <>
        <div className="supervisor-section-heading"><div><p>{dataTab === "users" ? "ATV GUIDE / USER DIRECTORY" : dataTab === "vehicles" ? "VEHICLE DATABASE / LIVE STATUS" : dataTab === "fleet-groups" ? "FLEET MANAGEMENT GROUPS" : "VEHICLE USAGE / ACCUMULATED HOURS"}</p><span>{dataTab === "users" ? "ข้อมูลผู้ใช้งานร่วมจากทั้งแอป" : dataTab === "vehicles" ? "เพิ่มและจัดการเบอร์รถของระบบ" : dataTab === "fleet-groups" ? "กำหนดกลุ่มรถและผู้รับผิดชอบฝูงรถ" : "ชั่วโมงสะสมจากทุกรอบที่ไกด์นำรถออกใช้งาน"}</span></div><button className="supervisor-refresh" type="button" onClick={() => { void fleetSnapshotQuery.refetch(); void guideSessionsQuery.refetch(); void guideStateQuery.refetch(); void vehicleFlowSnapshotQuery.refetch(); void directoryQuery.refetch(); }} aria-label="รีเฟรชฐานข้อมูล"><RefreshCw size={18} /></button></div>
        <div className="supervisor-metrics"><div><strong>{databaseStatusSummary.total}</strong><span>รถทั้งหมด</span></div><div className="ready"><strong>{databaseStatusSummary.ready}</strong><span>พร้อมใช้</span></div><div className="repair"><strong>{databaseStatusSummary.repair}</strong><span>ซ่อม</span></div><div className="inspection"><strong>{databaseStatusSummary.inspection}</strong><span>คำแนะนำ</span></div><div className="pickup"><strong>{databaseStatusSummary.pickup}</strong><span>แจ้งรับรถ</span></div><div className="active"><strong>{databaseStatusSummary.active}</strong><span>กำลังใช้งาน</span></div></div>

        {tab === "database" && dataTab === "users" && (
          <>
            <button type="button" className="supervisor-add-user" onClick={() => { setEditingUser(null); setNewUserName(""); setNewUserCode(""); setNewUserGroup(SUPERVISOR_USER_GROUPS[0]); setUserFormError(""); setShowAddUser(true); }}>
              <UsersRound size={22} />
              <span>เพิ่มผู้ใช้งาน</span>
              <strong aria-hidden="true">→</strong>
            </button>
            <div className="supervisor-table-card supervisor-directory-card">
              <div className="supervisor-card-title">
                <div><p>USER DIRECTORY / {userGroups.length} GROUPS</p><h3>ข้อมูลผู้ใช้งาน</h3></div>
                <span>{snapshot.directoryUsers.length} คน</span>
              </div>
              {userGroups.length ? (
                <div className="supervisor-user-group-list">
                  {userGroups.map(([group, users]) => (
                    <article key={group}>
                      <div className="supervisor-user-group-heading"><span className="supervisor-user-dot" /><div><b>{group}</b><small>{users.length} คน</small></div><strong>{users.length}</strong></div>
                      {users.length ? <div className="supervisor-user-record-list">{users.map(user => <div className="supervisor-user-record" key={user.id}><div><b>{user.name}</b><small>{user.code || user.hasCode ? (user.code || "มีรหัสตั้งค่าแล้ว") : "ไม่มีรหัส"}</small></div><div className="supervisor-record-actions"><button type="button" onClick={() => startEditUser(user)} aria-label={`แก้ไข ${user.name}`}>แก้ไข</button><button type="button" className="danger" onClick={() => confirmDelete("user", user.id, user.name)} aria-label={`ลบ ${user.name}`}>ลบ</button></div></div>)}</div> : <p>ยังไม่มีรายชื่อในกลุ่มนี้</p>}
                    </article>
                  ))}
                </div>
              ) : <p className="supervisor-empty-block">ยังไม่มีข้อมูลผู้ใช้งาน</p>}
            </div>
          </>
        )}

        {tab === "database" && dataTab === "vehicles" && <div className="supervisor-vehicle-groups">{vehiclesByCc.map(group => <section className="supervisor-table-card supervisor-data-card supervisor-cc-card" key={group.cc}><div className="supervisor-card-title"><div><p>VEHICLE DATABASE / {group.cc} CC.</p><h3>{group.cc} Cc.</h3></div><span>{group.rows.length} คัน</span>{group.cc === "200" && <button type="button" className="supervisor-plus-button" onClick={() => { setEditingVehicle(null); setNewVehicleNumber(""); setNewVehicleCc("200"); setVehicleFormError(""); setShowAddVehicle(true); }} aria-label="เพิ่มเบอร์รถ"><Plus size={22} /></button>}</div><div className="supervisor-table-scroll"><table><thead><tr><th>เบอร์รถ</th><th>สถานะ</th><th>กลุ่มผู้จัดการ</th></tr></thead><tbody>{group.rows.map(vehicle => <tr key={vehicle.number}><td><span className="supervisor-status-vehicle-number"><b className="supervisor-colored-vehicle-number" style={{ color: vehicle.color, borderColor: vehicle.color }}>#{vehicle.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={vehicle.number} accentColor={vehicle.color} onOpen={openSafetyNotices} /></span></td><td><span className={`supervisor-status ${vehicle.status}`}>{supervisorStatusLabel(vehicle.status)}</span></td><td><small>{vehicle.group}</small><span>{vehicle.manager}</span><div className="supervisor-record-actions"><button type="button" onClick={() => startEditVehicle(vehicle)} aria-label={`แก้ไขรถ ${vehicle.number}`}>แก้ไข</button><button type="button" className="danger" onClick={() => confirmDelete("vehicle", vehicle.number, `รถ #${vehicle.number}`)} aria-label={`ลบรถ ${vehicle.number}`}>ลบ</button></div></td></tr>)}{!group.rows.length && <tr><td colSpan={3} className="supervisor-empty">ยังไม่มีเบอร์รถในกลุ่มนี้</td></tr>}</tbody></table></div></section>)}</div>}

        {tab === "database" && dataTab === "usage-hours" && <div className="supervisor-vehicle-groups supervisor-usage-hours">{accumulatedHoursByCc.map(group => <section className="supervisor-table-card supervisor-data-card supervisor-cc-card" key={group.cc}><div className="supervisor-card-title"><div><p>VEHICLE USAGE / {group.cc} CC.</p><h3>ชั่วโมงสะสม {group.cc} ซีซี</h3></div><span>{group.rows.length} คัน</span></div><div className="supervisor-table-scroll"><table><thead><tr><th>เบอร์รถ</th><th>รอบ 30 นาที</th><th>รอบ 60 นาที</th><th>รอบรวม</th><th>ชั่วโมงสะสม</th><th>ใช้งานล่าสุด</th></tr></thead><tbody>{group.rows.map(vehicle => <tr key={vehicle.number}><td><span className="supervisor-status-vehicle-number"><b>#{vehicle.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={Number(vehicle.number)} accentColor={getResponsibilityGroupColor(Number(vehicle.number), snapshot.vehicleState.responsibilityGroups)} onOpen={openSafetyNotices} /><small>{vehicles.find(item => item.number === Number(vehicle.number))?.group ?? "ยังไม่มีกลุ่ม"} · {vehicles.find(item => item.number === Number(vehicle.number))?.manager ?? "ยังไม่ระบุผู้ดูแล"}</small></span></td><td>{vehicle.round30}</td><td>{vehicle.round60}</td><td><strong>{vehicle.totalRounds}</strong></td><td><strong className="supervisor-usage-hours-value">{vehicle.accumulatedHours.toFixed(1)} ชม.</strong></td><td>{vehicle.lastUsedAt ? formatDate(vehicle.lastUsedAt) : "ยังไม่มีรายการ"}</td></tr>)}{!group.rows.length && <tr><td colSpan={6} className="supervisor-empty">ยังไม่มีรถในกลุ่มนี้</td></tr>}</tbody></table></div></section>)}</div>}

        {tab === "database" && dataTab === "fleet-groups" && <div className="supervisor-data-stack"><div className="supervisor-data-toolbar"><div><p>FLEET MANAGEMENT GROUPS</p><h3>กลุ่มผู้จัดการฝูงรถ</h3></div><button type="button" className="supervisor-plus-button" onClick={() => { setEditingFleetGroupId(null); setNewFleetGroupName(""); setSelectedFleetVehicles([]); setSelectedFleetManagers([]); setNewFleetGroupColor("#81e597"); setFleetGroupError(""); setShowCreateFleetGroup(true); }} aria-label="สร้างกลุ่ม"><Plus size={22} /></button></div>{(snapshot.fleetGroups.length || unassignedFleetVehicles.length) ? <div className="supervisor-fleet-group-list">{unassignedFleetVehicles.length > 0 && <article className="supervisor-fleet-group-card supervisor-unassigned-fleet-group" style={{ borderColor: "#ffffff", "--fleet-group-color": "#ffffff" } as React.CSSProperties}><div className="supervisor-fleet-group-heading"><div><h4>รถยังไม่มีกลุ่ม</h4><span>{unassignedFleetVehicles.length} เบอร์รถ · ยังไม่มีผู้ดูแล</span></div><span className="supervisor-group-color-dot" style={{ backgroundColor: "#ffffff" }} aria-label="กลุ่มรถยังไม่มีกลุ่มสีขาว" /></div><p className="supervisor-unassigned-description">รถในรายการนี้สามารถเลือกเข้า Fleet Group ได้จากปุ่มสร้างหรือแก้ไขกลุ่ม</p><div className="supervisor-fleet-vehicle-numbers">{unassignedFleetVehicles.map(vehicle => <span className="supervisor-status-vehicle-number" key={vehicle.number}><b className="supervisor-colored-vehicle-number" style={{ color: "#ffffff", borderColor: "#ffffff" }}>#{vehicle.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={vehicle.number} accentColor="#ffffff" onOpen={openSafetyNotices} /></span>)}</div></article>}{snapshot.fleetGroups.map(group => <article className="supervisor-fleet-group-card" style={{ borderColor: group.color || "#81e597", "--fleet-group-color": group.color || "#81e597" } as React.CSSProperties} key={group.id}><div className="supervisor-fleet-group-heading"><div><h4>{group.name}</h4><span>{group.vehicleNumbers.length} เบอร์รถ · {group.managerIds.length} ผู้รับผิดชอบ</span></div><span className="supervisor-group-color-dot" style={{ backgroundColor: group.color || "#81e597" }} aria-label={`สีประจำกลุ่ม ${group.name}`} /></div><div className="supervisor-fleet-vehicle-numbers"><span>เบอร์รถ:</span>{group.vehicleNumbers.map(number => <span className="supervisor-status-vehicle-number" key={number}><b className="supervisor-colored-vehicle-number" style={{ color: group.color || "#81e597", borderColor: group.color || "#81e597" }}>#{number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={number} accentColor={group.color || "#81e597"} onOpen={openSafetyNotices} /></span>)}</div><p>ผู้รับผิดชอบ: {formatGroupManagerNames(group, snapshot.directoryUsers, group.managerIds.map(id => `#${id}`), "ยังไม่ได้กำหนด")}</p><div className="supervisor-record-actions supervisor-group-actions"><button type="button" onClick={() => editFleetGroup(group)}>แก้ไขกลุ่ม</button><button type="button" className="danger" onClick={() => confirmDelete("group", group.id, group.name)}>ลบกลุ่ม</button></div>{(() => { const notices = safetyNotices.filter(notice => group.vehicleNumbers.includes(notice.vehicleNumber)); return <details className="supervisor-fleet-notices"><summary>คำแนะนำจากช่าง ({notices.length})</summary>{notices.length ? notices.map(notice => <button type="button" key={notice.id} className="supervisor-fleet-notice" onClick={() => setNotice(`รถ #${notice.vehicleNumber}: ${notice.description}`)}><strong>รถ #{notice.vehicleNumber}</strong><span>{notice.description}</span><small>{notice.reporter} · {formatDate(notice.createdAt)}</small></button>) : <p>ยังไม่มีคำแนะนำจากช่างในกลุ่มนี้</p>}</details>; })()}</article>)}</div> : <div className="supervisor-empty-block">ยังไม่มีกลุ่มผู้จัดการฝูงรถ</div>}</div>}

        </>}
        {showSupervisorStandbyCreator && tab === "dashboard" && !selectedGuideSession ? <SupervisorStandbyCreator vehicles={supervisorStandbyVehicles} members={[...guideMembers.map(member => ({ id: member.id, name: member.name, role: snapshot.directoryUsers.find(user => String(user.id) === member.id)?.group })), ...(guideMembers.some(member => member.id === String(currentSupervisorActor.id)) ? [] : [{ id: String(currentSupervisorActor.id), name: currentSupervisorActor.name, role: "หัวหน้า" }])]} busyVehicleNumbers={new Set(guideSessions.filter(session => session.status !== "Completed").flatMap(session => session.vehicleIds.map(id => Number(id.replace(/^m3-v/, "")))))} busyMemberIds={new Set(guideSessions.filter(session => session.status !== "Completed").flatMap(session => session.memberIds))} creatorName={currentSupervisorActor.name} activeUserId={String(currentSupervisorActor.id)} safetyNotices={safetyNotices} onSafetyNoticeOpen={openSafetyNotices} onBack={() => setShowSupervisorStandbyCreator(false)} onCreate={createSupervisorStandby} /> : null}
        {tab === "status" && <VehicleResponsibilityGroupView vehicles={vehicles} responsibilityState={snapshot.vehicleState} directoryUsers={snapshot.directoryUsers} safetyNotices={safetyNotices} statusModel={supervisorStatusModel} titleKicker="SUPERVISOR / VEHICLE RESPONSIBILITY" chrome={safetyNoticeDialog} onBack={() => setTab("dashboard")} onSafetyNoticeOpen={openSafetyNotices} />}
        {tab === "dashboard" && !showSupervisorStandbyCreator && (selectedGuideSession ? supervisorSessionDetail : <>{supervisorGuideDashboard}{supervisorGuideDailyBoard}</>)}
        {tab === "queuePayout" && <>{supervisorQueuePayoutTabs}{queuePayoutView === "daily" ? supervisorGuideDailyBoard : <SupervisorPayoutOverview users={supervisorRoundTableUsers} sessions={guideSessions as PayoutSessionLike[]} values={snapshot.guideState.payoutRoundValues} />}</>}
        {tab === "issues" && supervisorGuideDailyBoard}
        {tab === "communication" && <section className="supervisor-communication-panel"><div className="supervisor-communication-heading"><div><p>SUPERVISOR / COMMUNICATION</p><h3>ห้องสื่อสาร</h3><span>PTT และข้อความร่วมกับไกด์และช่าง</span></div><MessageCircle size={22} /></div><PttRoomPanel /><CommunicationChat module="supervisor" /></section>}
        {tab === "settings" && <SupervisorPayoutOverview users={supervisorRoundTableUsers} sessions={guideSessions as PayoutSessionLike[]} values={snapshot.guideState.payoutRoundValues} />}
        {tab !== "database" && tab !== "dashboard" && tab !== "issues" && tab !== "communication" && tab !== "settings" && <div className="supervisor-placeholder"><Activity size={28} /><h3>{topNav.find(item => item.id === tab)?.label}</h3><p>{notice}</p><button type="button" onClick={() => setTab("database")}>กลับฐานข้อมูล</button></div>}
        {showAddUser && <div className="supervisor-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAddUser(false); }}><section className="supervisor-user-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-user-modal-title"><div className="supervisor-modal-heading"><div><p>USER DIRECTORY / {editingUser ? "EDIT USER" : "ADD USER"}</p><h3 id="supervisor-user-modal-title">{editingUser ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}</h3></div><button type="button" className="supervisor-modal-close" onClick={() => { setShowAddUser(false); setEditingUser(null); }} aria-label="ปิดหน้าต่างผู้ใช้งาน">×</button></div><form onSubmit={saveUser}><label>ชื่อผู้ใช้งาน<input autoFocus value={newUserName} onChange={event => setNewUserName(event.target.value)} placeholder="กรอกชื่อผู้ใช้งาน" /></label><label>รหัสผู้ใช้งาน<input value={newUserCode} onChange={event => setNewUserCode(event.target.value)} placeholder="เช่น G-001 หรือ M-001" /></label><label>กลุ่มผู้ใช้งาน<select value={newUserGroup} onChange={event => setNewUserGroup(event.target.value)}>{SUPERVISOR_USER_GROUPS.map(group => <option value={group} key={group}>{group}</option>)}</select></label>{userFormError && <p className="supervisor-form-error">{userFormError}</p>}<div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => setShowAddUser(false)}>ยกเลิก</button><button type="submit" className="supervisor-modal-submit">{editingUser ? "บันทึกการแก้ไข" : "บันทึกผู้ใช้งาน"}</button></div></form></section></div>}
        {showAddVehicle && <div className="supervisor-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAddVehicle(false); }}><section className="supervisor-user-modal supervisor-data-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-vehicle-modal-title"><div className="supervisor-modal-heading"><div><p>VEHICLE DATABASE / ADD VEHICLE</p><h3 id="supervisor-vehicle-modal-title">เพิ่มเบอร์รถ</h3></div><button type="button" className="supervisor-modal-close" onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} aria-label="ปิดหน้าต่างรถ">×</button></div><form onSubmit={saveVehicle}><label>เบอร์รถ<input autoFocus inputMode="numeric" value={newVehicleNumber} onChange={event => setNewVehicleNumber(event.target.value.replace(/[^0-9]/g, ""))} placeholder="กรอกเบอร์รถ" /></label><label>ขนาดรถ<select value={newVehicleCc} onChange={event => setNewVehicleCc(event.target.value as "200" | "250")}><option value="200">200cc</option><option value="250">250cc</option></select></label>{vehicleFormError && <p className="supervisor-form-error">{vehicleFormError}</p>}<div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => setShowAddVehicle(false)}>ยกเลิก</button><button type="submit" className="supervisor-modal-submit">บันทึก</button></div></form></section></div>}
        {showCreateFleetGroup && <div className="supervisor-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setShowCreateFleetGroup(false); setEditingFleetGroupId(null); } }}><section className="supervisor-user-modal supervisor-data-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-fleet-modal-title"><div className="supervisor-modal-heading"><div><p>FLEET MANAGEMENT GROUPS / {editingFleetGroupId ? "EDIT" : "CREATE"}</p><h3 id="supervisor-fleet-modal-title">{editingFleetGroupId ? "แก้ไขกลุ่มผู้จัดการฝูงรถ" : "สร้างกลุ่มผู้จัดการฝูงรถ"}</h3></div><button type="button" className="supervisor-modal-close" onClick={() => { setShowCreateFleetGroup(false); setEditingFleetGroupId(null); }} aria-label="ปิดหน้าต่าง">×</button></div><form onSubmit={saveFleetGroup}><label>ชื่อกลุ่ม<input autoFocus value={newFleetGroupName} onChange={event => setNewFleetGroupName(event.target.value)} placeholder="เช่น ฝูงเขาใหญ่" /></label><label>สีประจำกลุ่ม<div className="supervisor-color-picker-wrap"><input type="color" value={newFleetGroupColor} onChange={event => setNewFleetGroupColor(event.target.value)} /><code>{newFleetGroupColor}</code></div></label><fieldset className="supervisor-checklist"><legend>เลือกเบอร์รถจากฐานข้อมูลเบอร์รถ</legend>{fleetVehicleOptions.map(vehicle => <label key={vehicle.number}><input type="checkbox" checked={selectedFleetVehicles.includes(vehicle.number)} onChange={() => toggleFleetVehicle(vehicle.number)} /><span>#{vehicle.number} · {vehicle.cc}cc · {(() => { const assignedGroup = snapshot.fleetGroups.find(group => group.vehicleNumbers.includes(vehicle.number)); return assignedGroup ? `${assignedGroup.name} · ${formatGroupManagerNames(assignedGroup, snapshot.directoryUsers, assignedGroup.managerIds.map(id => `#${id}`), "ยังไม่ได้กำหนด")}` : "ยังไม่มีกลุ่ม · ยังไม่ระบุผู้ดูแล"; })()}</span></label>)}{!fleetVehicleOptions.length && <small>{snapshot.vehicleDatabase.length ? "รถทุกคันถูกจัดกลุ่มแล้ว" : "ยังไม่มีรถในฐานข้อมูลเบอร์รถ กรุณาเพิ่มรถก่อน"}</small>}</fieldset><fieldset className="supervisor-checklist"><legend>เลือกผู้รับผิดชอบ ไม่เกิน 2 คน</legend>{managerOptions.map(user => <label key={user.id}><input type="checkbox" checked={selectedFleetManagers.includes(user.id)} onChange={() => toggleFleetManager(user.id)} /><span>{user.name}{user.code ? ` · ${user.code}` : ""} · {supervisorGroupLabel(user.group)}</span></label>)}{!managerOptions.length && <small>ยังไม่มีรายชื่อผู้ใช้งานในระบบ</small>}</fieldset>{fleetGroupError && <p className="supervisor-form-error">{fleetGroupError}</p>}<div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => { setShowCreateFleetGroup(false); setEditingFleetGroupId(null); }}>ยกเลิก</button><button type="submit" className="supervisor-modal-submit">{editingFleetGroupId ? "บันทึกการแก้ไข" : "สร้างกลุ่ม"}</button></div></form></section></div>}
        {deleteConfirm && <div className="supervisor-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteConfirm(null); }}><section className="supervisor-user-modal supervisor-delete-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-delete-modal-title"><div className="supervisor-modal-heading"><div><p>CONFIRM DELETION</p><h3 id="supervisor-delete-modal-title">ยืนยันการลบ</h3></div><button type="button" className="supervisor-modal-close" onClick={() => setDeleteConfirm(null)} aria-label="ปิดหน้าต่างยืนยัน">×</button></div><div className="supervisor-delete-content"><p>คุณแน่ใจหรือไม่ว่าต้องการลบ <strong>{deleteConfirm.label}</strong>?</p><small>การดำเนินการนี้ไม่สามารถย้อนกลับได้</small></div><div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => setDeleteConfirm(null)}>ยกเลิก</button><button type="button" className="supervisor-modal-submit danger" onClick={executeDelete}>ยืนยันการลบ</button></div></section></div>}
      </section>
      <nav className="supervisor-bottom-nav" aria-label="เมนูหลักโมดูลหัวหน้า">{topNav.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => selectTab(item.id)}><Icon size={24} /><span>{item.label}</span></button>; })}</nav>
      <footer className="supervisor-footer"><a href="/">กลับระบบหลัก</a><span>Supervisor Module · ใช้ข้อมูลร่วมกับ Guide และ Mechanic</span></footer>
    </section>
  </main>;
}
