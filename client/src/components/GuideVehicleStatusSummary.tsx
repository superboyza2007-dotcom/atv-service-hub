import type { FleetVehicle } from "@/lib/fleet-status-summary";
import type { SupervisorDatabaseStatusSummary, SupervisorUserDirectoryStatusModel } from "@/lib/supervisor-data";

type VehicleSafetyNoticeLike = { vehicleNumber: number };
type GuideStatusVehicle = FleetVehicle & { number: string | number };

type GuideVehicleStatusSummaryProps = {
  vehicles: GuideStatusVehicle[];
  safetyNotices: VehicleSafetyNoticeLike[];
  onOpen: () => void;
  /** The live Supervisor User Directory model shared by Mechanic and Supervisor. */
  statusModel?: SupervisorUserDirectoryStatusModel;
  /** Kept for the Guide-standard entry point that already supplies summary counts. */
  statusCounts?: SupervisorDatabaseStatusSummary;
  ariaLabel?: string;
};

/** The single Guide-standard total vehicle status card shared by all modules. */
export function GuideVehicleStatusSummary({ vehicles, safetyNotices, onOpen, statusModel, statusCounts, ariaLabel = "เปิดสถานะรถรวมและกลุ่มรถในความดูแล" }: GuideVehicleStatusSummaryProps) {
  const counts = statusModel?.summary ?? statusCounts ?? {
    ready: vehicles.filter(vehicle => vehicle.status === "ready").length,
    repair: vehicles.filter(vehicle => vehicle.status === "repair").length,
    inspection: new Set(safetyNotices.filter(notice => vehicles.some(vehicle => Number(vehicle.number) === notice.vehicleNumber)).map(notice => notice.vehicleNumber)).size,
    pickup: vehicles.filter(vehicle => vehicle.status === "pickup").length,
    active: vehicles.filter(vehicle => vehicle.status === "active").length,
    total: vehicles.length,
  };

  return (
    <button type="button" className="m3-total-card" onClick={onOpen} aria-label={ariaLabel} data-status-source={statusModel || statusCounts ? "supervisor-user-directory" : "guide-total-status"}>
      <h3>สถานะรวม</h3>
      <span>รวมทั้งหมด</span>
      <div className="m3-cc-metrics">
        <div className="ready"><b>{counts.ready}</b><span>พร้อมใช้</span></div>
        <div className="repair"><b>{counts.repair}</b><span>ซ่อม</span></div>
        <div className="inspection"><b>{counts.inspection}</b><span>คำแนะนำ</span></div>
        <div className="pickup"><b>{counts.pickup}</b><span>แจ้งรับรถ</span></div>
        <div className="active"><b>{counts.active}</b><span>กำลังใช้งาน</span></div>
        <div className="total"><b>{counts.total}</b><span>รวมทั้งหมด</span></div>
      </div>
    </button>
  );
}
