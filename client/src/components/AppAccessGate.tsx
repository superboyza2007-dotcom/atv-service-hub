import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { canOpenModule, identityFromServerSession, moduleForUserGroup, type AppAccessTarget, type AppIdentity, type AppModule } from "@/lib/app-access";

type AppAccessGateProps = { requestedModule: AppAccessTarget | null; children: ReactNode };

function LoginView({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const directoryLogin = trpc.directory.authenticate.useMutation();
  const specialLogin = trpc.directory.specialAuthenticate.useMutation();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    try {
      const special = await specialLogin.mutateAsync({ code: code.trim() });
      if (special?.special) {
        setCode("");
        await onAuthenticated();
        return;
      }
    } catch {
      // A regular directory code may still be valid if special access is unavailable.
    }
    try {
      const user = await directoryLogin.mutateAsync({ code: code.trim() });
      if (!user) {
        setError("รหัสไม่ถูกต้อง หรือยังไม่ได้ผูกกลุ่มผู้ใช้งาน");
        return;
      }
      if (!moduleForUserGroup(user.group)) {
        setError("รหัสนี้ยังไม่มีโมดูลที่อนุญาตให้เข้าใช้งาน");
        return;
      }
      setCode("");
      await onAuthenticated();
    } catch {
      setError("เชื่อมต่อฐานข้อมูลผู้ใช้งานไม่ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };
  return <main className="app-access-shell"><section className="app-access-card"><div className="app-access-mark"><LockKeyhole size={24} /></div><p className="app-access-kicker">ATV OPERATIONS / ACCESS</p><h1>เข้าสู่ระบบ</h1><span>กรอกรหัสผู้ใช้งานเพื่อเข้าโมดูลที่ได้รับสิทธิ์</span><form onSubmit={submit} className="app-access-form"><label htmlFor="app-access-code">รหัสเข้าสู่ระบบ<input id="app-access-code" type="password" value={code} onChange={event => { setCode(event.target.value); setError(""); }} autoComplete="off" autoFocus placeholder="กรอกรหัส" /></label><button type="submit" disabled={directoryLogin.isPending || specialLogin.isPending}><ArrowRight size={17} /> {directoryLogin.isPending || specialLogin.isPending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}</button>{error && <p className="app-access-error" role="alert">{error}</p>}</form></section></main>;
}

function SpecialChooser({ identity, onLogout }: { identity: AppIdentity; onLogout: () => void }) {
  const modules: Array<{ key: AppModule; label: string; description: string }> = [
    { key: "guide", label: "โมดูลไกด์", description: "สถานะรถ รันคิว และงานปฏิบัติการ" },
    { key: "mechanic", label: "โมดูลช่าง", description: "แจ้งซ่อม รอบเปลี่ยน และห้องสื่อสาร" },
    { key: "supervisor", label: "โมดูลหัวหน้า", description: "Dashboard ฐานข้อมูล และการควบคุมงาน" },
  ];
  return <main className="special-access-shell"><section className="special-access-card"><div className="special-access-head"><div><p>SPECIAL ACCESS / MODULE SELECTOR</p><h1>เลือกโมดูล</h1><span>เข้าสู่พื้นที่ปฏิบัติงานที่ต้องการ</span></div><ShieldCheck size={28} /></div><div className="special-access-identity"><UserRound size={16} /><span>เข้าสู่ระบบในนาม <strong>{identity.name}</strong></span><button type="button" onClick={onLogout} aria-label="ออกจากระบบ"><LogOut size={15} /> ออก</button></div><div className="special-module-grid">{modules.map(module => <a key={module.key} href={`/?module=${module.key}`} className="special-module-card"><span>{module.label}</span><small>{module.description}</small><ArrowRight size={18} /></a>)}</div></section></main>;
}

export default function AppAccessGate({ requestedModule, children }: AppAccessGateProps) {
  const sessionQuery = trpc.directory.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const presenceMutation = trpc.directory.heartbeat.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [error, setError] = useState("");
  const identity = identityFromServerSession(sessionQuery.data);
  const storedModule = identity?.module ?? null;
  const hasAccess = Boolean(identity && requestedModule && canOpenModule(identity, requestedModule));

  useEffect(() => {
    if (identity?.memberId == null) return;
    const heartbeat = () => presenceMutation.mutate();
    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, [identity?.memberId, presenceMutation.mutate]);

  useEffect(() => {
    if (!identity || identity.special || requestedModule || !storedModule) return;
    window.location.href = `/?module=${storedModule}`;
  }, [identity?.memberId, identity?.special, requestedModule, storedModule]);

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
      window.location.href = "/";
    } catch {
      setError("ออกจากระบบบน Server ไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  if (sessionQuery.isPending) return <main className="app-access-shell"><section className="app-access-card" role="status"><p className="app-access-kicker">SERVER / SESSION</p><h1>กำลังตรวจสอบบัญชีจาก Server</h1></section></main>;
  if (sessionQuery.isError) return <main className="app-access-shell"><section className="app-access-card" role="alert"><h1>เชื่อมต่อ Server ไม่ได้</h1><span>ระบบจะไม่ใช้ข้อมูลในเบราว์เซอร์แทนข้อมูลจาก Server</span><button type="button" onClick={() => void sessionQuery.refetch()}>ลองเชื่อมต่ออีกครั้ง</button></section></main>;
  if (!identity) return <LoginView onAuthenticated={async () => { const result = await sessionQuery.refetch(); if (result.isError || !result.data) throw new Error("Server session unavailable"); }} />;
  if (identity.special && !requestedModule) return <>{error && <p className="app-access-error" role="alert">{error}</p>}<SpecialChooser identity={identity} onLogout={() => void logout()} /></>;
  if (!requestedModule && storedModule) return <main className="app-access-shell"><section className="app-access-card" role="status"><h1>กำลังเปิดโมดูลของคุณ</h1></section></main>;
  if (!hasAccess) return <main className="app-access-shell"><section className="app-access-card"><div className="app-access-mark"><ShieldCheck size={24} /></div><p className="app-access-kicker">ACCESS DENIED</p><h1>ไม่มีสิทธิ์เข้าโมดูลนี้</h1><span>รหัสของคุณอนุญาตเฉพาะ {identity.module === "guide" ? "โมดูลไกด์" : identity.module === "mechanic" ? "โมดูลช่าง" : identity.module === "supervisor" ? "โมดูลหัวหน้า" : "โมดูลที่กำหนดบน Server"}</span><button type="button" className="app-access-secondary" onClick={() => { window.location.href = identity.module ? `/?module=${identity.module}` : "/"; }}><ArrowRight size={17} /> ไปยังโมดูลของฉัน</button><button type="button" className="app-access-logout" onClick={() => void logout()}><LogOut size={15} /> ออกจากระบบ</button>{error && <p className="app-access-error" role="alert">{error}</p>}</section></main>;
  return <>{children}</>;
}
