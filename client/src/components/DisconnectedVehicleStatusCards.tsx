import { GuideVehicleStatusSummary } from "@/components/GuideVehicleStatusSummary";
import type { FleetVehicle } from "@/lib/fleet-status-summary";
import type { SupervisorCcStatusModel, SupervisorUserDirectoryStatusModel } from "@/lib/supervisor-data";

type DisconnectedVehicleStatusCardsProps = {
  vehicles: Array<FleetVehicle & { number: string | number }>;
  safetyNotices: Array<{ vehicleNumber: number }>;
  onOpenGroupView: () => void;
  statusModel: SupervisorUserDirectoryStatusModel;
};

type StatusMetric = keyof SupervisorCcStatusModel["summary"];

const STATUS_METRICS: Array<{ key: StatusMetric; label: string; className: string }> = [
  { key: "ready", label: "พร้อมใช้", className: "ready" },
  { key: "repair", label: "ซ่อม", className: "repair" },
  { key: "inspection", label: "คำแนะนำ", className: "inspection" },
  { key: "pickup", label: "แจ้งรับรถ", className: "pickup" },
  { key: "active", label: "กำลังใช้งาน", className: "active" },
  { key: "total", label: "รวมทั้งหมด", className: "total" },
];

/** Shared CC cards for Mechanic and Supervisor. The only data plug is the Supervisor User Directory model. */
export function DisconnectedVehicleStatusCards({ vehicles, safetyNotices, onOpenGroupView, statusModel }: DisconnectedVehicleStatusCardsProps) {
  return (
    <div className="m3-status-cards m3-disconnected-status-cards" aria-label="สถานะรถตามมาตรฐาน Guide">
      <div className="m3-cc-card-grid">
        {(["200", "250"] as const).map(cc => {
          const status = statusModel.byCc[cc];
          return (
            <div className="m3-cc-card" data-status-source="supervisor-user-directory" data-vehicle-cc={cc} key={cc}>
              <h3>{cc} ซีซี</h3>
              <div className="m3-cc-metrics">
                {STATUS_METRICS.map(metric => (
                  <div className={metric.className} key={metric.key}>
                    <b>{status.summary[metric.key]}</b>
                    <span>{metric.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <GuideVehicleStatusSummary vehicles={vehicles} safetyNotices={safetyNotices} statusModel={statusModel} onOpen={onOpenGroupView} />
    </div>
  );
}
