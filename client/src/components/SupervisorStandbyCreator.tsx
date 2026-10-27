import React from "react";
import { SessionCreatorForm, type SessionCreatorDraft, type SessionCreatorMember, type SessionCreatorVehicle } from "./SessionCreatorForm";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";
import { trpc } from "@/lib/trpc";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS } from "@shared/supervisor-timer-settings";

export type SupervisorStandbyDraft = SessionCreatorDraft;
type Props = { vehicles: SessionCreatorVehicle[]; members: SessionCreatorMember[]; busyVehicleNumbers: Set<number>; busyMemberIds?: Set<string>; creatorName: string; activeUserId: string; onBack: () => void; onCreate: (draft: SupervisorStandbyDraft) => void; safetyNotices?: VehicleSafetyNotice[]; onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void; responsibilityGroups?: ResponsibilityGroupRecord[]; queueManagerIds?: string[] };

export function SupervisorStandbyCreator(props: Props) {
  const settings = trpc.supervisorTimerSettings.get.useQuery(undefined, { retry: false });
  return <SessionCreatorForm {...props} roleLabel="Guide / Mechanic" activeUserId={props.activeUserId} activeUserName={props.creatorName} defaultDurationMinutes={settings.data?.defaultDurationMinutes ?? DEFAULT_SUPERVISOR_TIMER_SETTINGS.defaultDurationMinutes} lockActiveUser />;
}
