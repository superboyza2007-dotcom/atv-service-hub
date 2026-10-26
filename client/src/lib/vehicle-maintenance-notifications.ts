export type MaintenanceNotificationStatus = "รอตรวจสอบ" | "รับทราบแล้ว";
export type MaintenanceNotificationRecipient = { id: number; name: string };

export type VehicleMaintenanceNotification = {
  id: string;
  ruleId: string;
  ruleName: string;
  vehicleNumber: number;
  cc: string;
  accumulatedHours: number;
  thresholdHours: number;
  message: string;
  mechanic: string;
  recipients: MaintenanceNotificationRecipient[];
  eligibleGuideIds?: number[];
  responsibilityGroupId?: string;
  responsibilityGroupName?: string;
  createdAt: string;
  status: MaintenanceNotificationStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};

export function normalizeVehicleMaintenanceNotifications(value: unknown): VehicleMaintenanceNotification[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<VehicleMaintenanceNotification>;
    if (
      typeof source.id !== "string" || typeof source.ruleId !== "string" || typeof source.ruleName !== "string" ||
      !Number.isFinite(source.vehicleNumber) || typeof source.cc !== "string" ||
      !Number.isFinite(source.accumulatedHours) || !Number.isFinite(source.thresholdHours) ||
      typeof source.message !== "string" || typeof source.mechanic !== "string" || typeof source.createdAt !== "string" ||
      (source.status !== "รอตรวจสอบ" && source.status !== "รับทราบแล้ว") || !Array.isArray(source.recipients)
    ) return [];
    const recipients = source.recipients.flatMap(recipient => {
      if (!recipient || typeof recipient !== "object") return [];
      const value = recipient as Partial<MaintenanceNotificationRecipient>;
      return Number.isFinite(value.id) && typeof value.name === "string" ? [{ id: Number(value.id), name: value.name }] : [];
    });
    const eligibleGuideIds = Array.isArray(source.eligibleGuideIds)
      ? Array.from(new Set(source.eligibleGuideIds.map(Number).filter(id => Number.isInteger(id) && id > 0)))
      : undefined;
    return [{
      ...source,
      vehicleNumber: Number(source.vehicleNumber),
      accumulatedHours: Number(source.accumulatedHours),
      thresholdHours: Number(source.thresholdHours),
      recipients,
      eligibleGuideIds,
      responsibilityGroupId: source.responsibilityGroupId == null ? undefined : String(source.responsibilityGroupId),
    } as VehicleMaintenanceNotification];
  });
}

export function notificationsForGuide(
  notifications: VehicleMaintenanceNotification[],
  guideId: number | undefined,
  isSpecialAccess = false,
) {
  if (isSpecialAccess) return notifications;
  if (!Number.isInteger(guideId)) return [];
  return notifications.filter(notification => notification.eligibleGuideIds?.length
    ? notification.eligibleGuideIds.includes(guideId as number)
    : notification.recipients.some(recipient => recipient.id === guideId));
}

export function acknowledgeVehicleMaintenanceNotification(
  notifications: VehicleMaintenanceNotification[],
  notificationId: string,
  acknowledgedBy: string,
  acknowledgedAt: string,
) {
  return notifications.map(notification => notification.id === notificationId
    ? { ...notification, status: "รับทราบแล้ว" as const, acknowledgedBy, acknowledgedAt }
    : notification);
}

export function pendingVehicleMaintenanceNotifications(notifications: VehicleMaintenanceNotification[]) {
  return notifications.filter(notification => notification.status === "รอตรวจสอบ");
}

export function hasVehicleMaintenanceNotification(notifications: VehicleMaintenanceNotification[], ruleId: string | undefined, vehicleNumber: number) {
  return Boolean(ruleId) && notifications.some(notification => notification.ruleId === ruleId && notification.vehicleNumber === vehicleNumber && notification.status === "รอตรวจสอบ");
}
