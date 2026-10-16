import { useState } from "react";
import { LogOut } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ModuleLogoutButton() {
  const logoutMutation = trpc.auth.logout.useMutation();
  const [error, setError] = useState("");
  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
      window.location.href = "/";
    } catch {
      setError("ออกจากระบบบน Server ไม่สำเร็จ");
    }
  };
  return <><button type="button" className="module-logout-button" onClick={() => void logout()} disabled={logoutMutation.isPending} aria-label="ออกจากบัญชี" title="ออกจากบัญชี"><LogOut size={15} /><span>ออกจากบัญชี</span></button>{error && <span role="alert">{error}</span>}</>;
}
