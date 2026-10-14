import React from "react";
import VehicleCard from "@/components/VehicleCard";
import { VehicleSafetyNoticeList } from "@/components/VehicleSafetyNotice";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";
import { resolveVehicleManagerNames, type ManagerDirectoryEntry } from "@/lib/vehicle-manager-resolver";

export type ActiveVehicleDetailRow = {
  id: string;
  number: number;
  cc: string;
  managers: string[];
  accentColor?: string;
};

type ActiveVehicleDetailListProps = {
  sessionId: string;
  vehicles: ActiveVehicleDetailRow[];
  activeStaff: string[];
  activeRoles: string[];
  safetyNotices: VehicleSafetyNotice[];
  onSafetyNoticeOpen: (notices: VehicleSafetyNotice[]) => void;
  responsibilityGroups?: ResponsibilityGroupRecord[];
  managerDirectory?: ManagerDirectoryEntry[];
};

export function ActiveVehicleDetailList({
  sessionId,
  vehicles,
  activeStaff,
  activeRoles,
  safetyNotices,
  onSafetyNoticeOpen,
  responsibilityGroups = [],
  managerDirectory = [],
}: ActiveVehicleDetailListProps) {
  return (
    <>
      <div className="m3-vehicle-card-list m3-active-vehicle-card-list">
        {vehicles.map(vehicle => (
          <VehicleCard
            key={vehicle.id}
            number={vehicle.number}
            cc={vehicle.cc}
            managers={resolveVehicleManagerNames(vehicle.number, responsibilityGroups, managerDirectory, vehicle.managers)}
            status="active"
            sessionId={sessionId}
            activeStaff={activeStaff}
            activeRoles={activeRoles}
            safetyNotices={safetyNotices}
            onSafetyNoticeOpen={onSafetyNoticeOpen}
            responsibilityGroups={responsibilityGroups}
            managerDirectory={managerDirectory}
            accentColor={vehicle.accentColor}
          />
        ))}
      </div>
      <VehicleSafetyNoticeList
        vehicleNumbers={vehicles.map(vehicle => vehicle.number)}
        notices={safetyNotices}
        onOpen={onSafetyNoticeOpen}
      />
    </>
  );
}
