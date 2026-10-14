import { describe, expect, it } from "vitest";
import { canManageActiveSession, canSendSessionMessage, canUsePermission } from "./permissions";

describe("Active session permissions", () => {
  it("allows a non-member to send Session Chat messages when a session is open", () => {
    expect(canSendSessionMessage(true)).toBe(true);
  });

  it("keeps vehicle and completion actions restricted to members or supervisors", () => {
    expect(canManageActiveSession("GUIDE", false)).toBe(false);
    expect(canManageActiveSession("MECHANIC", false)).toBe(false);
    expect(canManageActiveSession("MANAGER", false)).toBe(false);
    expect(canManageActiveSession("DUTY", false)).toBe(false);
    expect(canManageActiveSession("GUIDE", true)).toBe(true);
    expect(canManageActiveSession("SUPERVISOR", false)).toBe(true);
    expect(canUsePermission("GUIDE", "edit", false)).toBe(false);
  });
});
