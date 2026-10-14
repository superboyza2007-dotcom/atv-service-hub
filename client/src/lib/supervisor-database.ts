export type SupervisorVehicleRecord = { number: number; cc: "200" | "250" };
export type SupervisorFleetGroup = { id: string; name: string; vehicleNumbers: number[]; managerIds: number[]; color?: string };

export function addSupervisorVehicle(records: SupervisorVehicleRecord[], rawNumber: string, cc: "200" | "250") {
  const number = Number(rawNumber.trim());
  if (!Number.isInteger(number) || number <= 0) return { records, error: "กรุณากรอกเบอร์รถเป็นตัวเลขจำนวนเต็มที่มากกว่า 0" };
  if (records.some(record => record.number === number)) return { records, error: "เบอร์รถนี้มีอยู่แล้วในฐานข้อมูล" };
  return { records: [...records, { number, cc }].sort((a, b) => a.number - b.number), error: "" };
}

export function addSupervisorFleetGroup(groups: SupervisorFleetGroup[], name: string, vehicleNumbers: number[], managerIds: number[], id: string, color = "#81e597") {
  const trimmedName = name.trim();
  if (!trimmedName || !vehicleNumbers.length || !managerIds.length) return { groups, error: "กรุณากรอกชื่อกลุ่ม เลือกเบอร์รถ และเลือกผู้รับผิดชอบอย่างน้อย 1 คน" };
  if (managerIds.length > 2) return { groups, error: "เลือกผู้รับผิดชอบได้ไม่เกิน 2 คน" };
  const managerError = duplicateManagerError(groups, managerIds);
  if (managerError) return { groups, error: managerError };
  if (groups.some(group => group.name.trim().toLowerCase() === trimmedName.toLowerCase())) return { groups, error: "ชื่อกลุ่มนี้มีอยู่แล้ว" };
  const usedVehicleNumbers = new Set(groups.flatMap(group => group.vehicleNumbers));
  if (vehicleNumbers.some(number => usedVehicleNumbers.has(number))) return { groups, error: "เบอร์รถที่เลือกมีอยู่ในกลุ่มอื่นแล้ว" };
  const group: SupervisorFleetGroup = { id, name: trimmedName, vehicleNumbers: Array.from(new Set(vehicleNumbers)).sort((a, b) => a - b), managerIds: Array.from(new Set(managerIds)).slice(0, 2), color };
  return { groups: [...groups, group], error: "" };
}

export function availableVehiclesForFleetGroup(records: SupervisorVehicleRecord[], groups: SupervisorFleetGroup[], editingId?: string): SupervisorVehicleRecord[] {
  const usedByOtherGroups = new Set(groups.filter(group => group.id !== editingId).flatMap(group => group.vehicleNumbers));
  return records.filter(record => !usedByOtherGroups.has(record.number)).sort((a, b) => a.number - b.number);
}

export function availableManagersForFleetGroup(managerIds: number[], groups: SupervisorFleetGroup[], editingId?: string): number[] {
  const usedByOtherGroups = new Set(groups.filter(group => group.id !== editingId).flatMap(group => group.managerIds));
  return managerIds.filter(id => !usedByOtherGroups.has(id));
}

function duplicateManagerError(groups: SupervisorFleetGroup[], managerIds: number[], editingId?: string) {
  const usedByOtherGroups = new Set(groups.filter(group => group.id !== editingId).flatMap(group => group.managerIds));
  const duplicateIds = managerIds.filter(id => usedByOtherGroups.has(id));
  return duplicateIds.length ? `ผู้รับผิดชอบ ${duplicateIds.map(id => `#${id}`).join(", ")} อยู่ในกลุ่มอื่นแล้ว กรุณาเลือกชื่อที่ยังไม่ถูกใช้` : "";
}

export function updateSupervisorFleetGroup(groups: SupervisorFleetGroup[], id: string, name: string, vehicleNumbers: number[], managerIds: number[], color = "#81e597") {
  const trimmedName = name.trim();
  const current = groups.find(group => group.id === id);
  if (!current) return { groups, error: "ไม่พบกลุ่มที่ต้องการแก้ไข" };
  if (!trimmedName || !vehicleNumbers.length || !managerIds.length) return { groups, error: "กรุณากรอกชื่อกลุ่ม เลือกเบอร์รถ และเลือกผู้รับผิดชอบอย่างน้อย 1 คน" };
  if (managerIds.length > 2) return { groups, error: "เลือกผู้รับผิดชอบได้ไม่เกิน 2 คน" };
  const managerError = duplicateManagerError(groups, managerIds, id);
  if (managerError) return { groups, error: managerError };
  if (groups.some(group => group.id !== id && group.name.trim().toLowerCase() === trimmedName.toLowerCase())) return { groups, error: "ชื่อกลุ่มนี้มีอยู่แล้ว" };
  const usedByOtherGroups = new Set(groups.filter(group => group.id !== id).flatMap(group => group.vehicleNumbers));
  if (vehicleNumbers.some(number => usedByOtherGroups.has(number))) return { groups, error: "เบอร์รถที่เลือกมีอยู่ในกลุ่มอื่นแล้ว" };
  return { groups: groups.map(group => group.id === id ? { ...group, name: trimmedName, vehicleNumbers: Array.from(new Set(vehicleNumbers)).sort((a, b) => a - b), managerIds: Array.from(new Set(managerIds)).slice(0, 2), color } : group), error: "" };
}
