import React from "react";
import { SessionCreatorForm, type SessionCreatorDraft, type SessionCreatorMember, type SessionCreatorVehicle } from "./SessionCreatorForm";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";

export type SupervisorStandbyDraft = SessionCreatorDraft;
type Props = { vehicles: SessionCreatorVehicle[]; members: SessionCreatorMember[]; busyVehicleNumbers: Set<number>; busyMemberIds?: Set<string>; creatorName: string; activeUserId: string; onBack: () => void; onCreate: (draft: SupervisorStandbyDraft) => void; safetyNotices?: VehicleSafetyNotice[]; onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void };

export function SupervisorStandbyCreator(props: Props) {
  return <SessionCreatorForm {...props} roleLabel="Guide / Mechanic" activeUserId={props.activeUserId} activeUserName={props.creatorName} lockActiveUser />;
}
