import React, { useState, type CSSProperties } from "react";
import { Check, Circle, LockKeyhole } from "lucide-react";
import { VehicleSafetyNoticeIndicator } from "@/components/VehicleSafetyNotice";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { resolveVehicleResponsibilityView, type ManagerDirectoryEntry } from "@/lib/vehicle-manager-resolver";
import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";

export type VehicleChoiceItem = {
  id: string;
  number: number;
  cc: string | number;
  statusLabel?: string;
  fallbackGroupLabel?: string;
  fallbackManagers?: string[];
  accentColor?: string;
  disabled?: boolean;
  disabledReason?: string;
  safetyNotices?: VehicleSafetyNotice[];
};

export type VehicleChoiceListProps = {
  items: VehicleChoiceItem[];
  selectedId?: string;
  onSelect: (vehicleId: string) => void;
  responsibilityGroups?: ResponsibilityGroupRecord[];
  managerDirectory?: ManagerDirectoryEntry[];
  onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void;
  ariaLabel?: string;
  emptyLabel?: string;
  actionLabel?: string;
  compact?: boolean;
};

const splitManagerFallbacks = (names: string[] = []) => Array.from(new Set(
  names
    .flatMap(name => name.split("·"))
    .map(name => name.trim())
    .filter(Boolean),
));

export function VehicleChoiceList({
  items,
  selectedId,
  onSelect,
  responsibilityGroups,
  managerDirectory,
  onSafetyNoticeOpen,
  ariaLabel = "เลือกรถ",
  emptyLabel = "ไม่มีรถที่ตรงตามเงื่อนไข",
  actionLabel = "เลือกคันนี้",
  compact = false,
}: VehicleChoiceListProps) {
  if (!items.length) {
    return <p className="vehicle-choice-empty">{emptyLabel}</p>;
  }

  return (
    <div className="vehicle-choice-list" role="radiogroup" aria-label={ariaLabel}>
      {items.map(item => {
        const view = responsibilityGroups && managerDirectory
          ? resolveVehicleResponsibilityView(item.number, responsibilityGroups, managerDirectory, item.fallbackManagers ?? [], item.accentColor)
          : undefined;
        const fallbackManagers = splitManagerFallbacks(item.fallbackManagers);
        const managers = view?.managerNames.length ? view.managerNames : fallbackManagers;
        const groupLabel = view?.group
          ? view.groupLabel
          : item.fallbackGroupLabel || view?.groupLabel || "ยังไม่มีกลุ่ม";
        const managerLabel = managers.length ? managers.join(" · ") : "ยังไม่ระบุผู้ดูแล";
        const accentColor = view?.group?.color || item.accentColor || "#81e597";
        const selected = item.id === selectedId;
        const disabled = Boolean(item.disabled);
        const notices = item.safetyNotices ?? [];

        return (
          <button
            type="button"
            key={item.id}
            role="radio"
            aria-checked={selected}
            aria-label={`รถหมายเลข ${item.number} ${groupLabel} ${managerLabel}`}
            className={`vehicle-choice-card${compact ? " is-compact" : ""}${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
            style={{ "--vehicle-choice-accent": accentColor } as CSSProperties}
            disabled={disabled}
            onClick={() => onSelect(item.id)}
            title={disabled ? item.disabledReason : actionLabel}
          >
            <span className="vehicle-choice-main">
              <span className="vehicle-choice-number-row">
                <strong>#{item.number}</strong>
                {onSafetyNoticeOpen && (
                  <VehicleSafetyNoticeIndicator
                    notices={notices}
                    vehicleNumber={item.number}
                    accentColor={accentColor}
                    inline
                    onOpen={onSafetyNoticeOpen}
                  />
                )}
              </span>
              <span className="vehicle-choice-primary-meta">
                {item.cc} ซีซี <i aria-hidden="true">·</i> {groupLabel}
              </span>
              <span className="vehicle-choice-manager-meta">
                <small>ผู้ดูแลกลุ่มรถ</small>
                <b>{managerLabel}</b>
              </span>
              {item.statusLabel && <span className="vehicle-choice-status">{item.statusLabel}</span>}
              {disabled && item.disabledReason && <span className="vehicle-choice-disabled-reason"><LockKeyhole size={12} /> {item.disabledReason}</span>}
            </span>
            <span className="vehicle-choice-action" aria-hidden="true">
              <span className="vehicle-choice-radio">{selected ? <Check size={15} strokeWidth={3} /> : <Circle size={23} strokeWidth={1.7} />}</span>
              <small>{selected ? "เลือกแล้ว" : actionLabel}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type VehicleReplacementPanelProps = {
  currentItems: VehicleChoiceItem[];
  replacementItems: VehicleChoiceItem[];
  selectedFromId?: string;
  selectedToId?: string;
  onFromSelect: (vehicleId: string) => void;
  onToSelect: (vehicleId: string) => void;
  onConfirm: () => void;
  responsibilityGroups?: ResponsibilityGroupRecord[];
  managerDirectory?: ManagerDirectoryEntry[];
  onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void;
  confirmDisabled?: boolean;
};

export function VehicleReplacementPanel({
  currentItems,
  replacementItems,
  selectedFromId,
  selectedToId,
  onFromSelect,
  onToSelect,
  onConfirm,
  responsibilityGroups,
  managerDirectory,
  onSafetyNoticeOpen,
  confirmDisabled,
}: VehicleReplacementPanelProps) {
  return (
    <div className="m3-modal-form vehicle-choice-form">
      <div className="vehicle-choice-section">
        <span className="vehicle-choice-section-label">รถที่จะเอาออก</span>
        <VehicleChoiceList items={currentItems} selectedId={selectedFromId} responsibilityGroups={responsibilityGroups} managerDirectory={managerDirectory} onSafetyNoticeOpen={onSafetyNoticeOpen} onSelect={onFromSelect} ariaLabel="เลือกรถเดิมที่จะเปลี่ยน" actionLabel="เลือกรถเดิม" emptyLabel="ไม่มีรถใน Active" />
      </div>
      <div className="vehicle-choice-section">
        <span className="vehicle-choice-section-label">รถที่จะนำเข้าแทน</span>
        <VehicleChoiceList items={replacementItems} selectedId={selectedToId} responsibilityGroups={responsibilityGroups} managerDirectory={managerDirectory} onSafetyNoticeOpen={onSafetyNoticeOpen} onSelect={onToSelect} ariaLabel="เลือกรถพร้อมใช้เพื่อแทนที่" actionLabel="เลือกแทน" emptyLabel="ไม่มีรถที่ว่างและพร้อมใช้" />
      </div>
      <button type="button" className="m3-primary" disabled={confirmDisabled} onClick={onConfirm}>ยืนยันเปลี่ยนรถ</button>
    </div>
  );
}

export function VehicleChoicePicker({
  items,
  selectedId,
  onSelect,
  responsibilityGroups,
  managerDirectory,
  onSafetyNoticeOpen,
  ariaLabel = "เลือกรถ",
  placeholder = "เลือกรถ",
}: VehicleChoiceListProps & { placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selectedItem = items.find(item => item.id === selectedId);
  const selectedView = selectedItem && responsibilityGroups && managerDirectory
    ? resolveVehicleResponsibilityView(selectedItem.number, responsibilityGroups, managerDirectory, selectedItem.fallbackManagers ?? [], selectedItem.accentColor)
    : undefined;
  const selectedManagers = selectedView?.managerNames.length
    ? selectedView.managerNames.join(" · ")
    : splitManagerFallbacks(selectedItem?.fallbackManagers).join(" · ");
  const selectedLabel = selectedItem
    ? `#${selectedItem.number} · ${selectedItem.cc} ซีซี · ${selectedView?.group ? selectedView.groupLabel : selectedItem.fallbackGroupLabel || "ยังไม่มีกลุ่ม"} · ${selectedManagers || "ยังไม่ระบุผู้ดูแล"}`
    : placeholder;

  return (
    <div className="vehicle-choice-picker">
      <button
        type="button"
        className={`vehicle-choice-picker-trigger${selectedItem ? " has-value" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(value => !value)}
      >
        <span>{selectedLabel}</span>
        <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div className="vehicle-choice-picker-panel" role="dialog" aria-label={ariaLabel}>
          <div className="vehicle-choice-picker-heading">
            <strong>{ariaLabel}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิดรายการรถ">×</button>
          </div>
          <VehicleChoiceList
            items={items}
            selectedId={selectedId}
            responsibilityGroups={responsibilityGroups}
            managerDirectory={managerDirectory}
            onSafetyNoticeOpen={onSafetyNoticeOpen}
            onSelect={vehicleId => { onSelect(vehicleId); setOpen(false); }}
            ariaLabel={ariaLabel}
            actionLabel="เลือก"
            emptyLabel="ไม่มีรถที่ตรงตามเงื่อนไข"
            compact
          />
        </div>
      )}
    </div>
  );
}
