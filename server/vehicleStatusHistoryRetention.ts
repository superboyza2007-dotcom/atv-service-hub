export type VehicleStatusHistoryClearState = {
  vehicleStatus: string | undefined;
  hasOpenRepair: boolean;
  hasLiveSession: boolean;
  hasUnreadPickupNotification: boolean;
};

export function shouldClearVehicleStatusHistory(state: VehicleStatusHistoryClearState) {
  return state.vehicleStatus === "ready"
    && !state.hasOpenRepair
    && !state.hasLiveSession
    && !state.hasUnreadPickupNotification;
}
