import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CrmContext, type NewLeadPreset } from "@/components/crm/context";
import { LeadSheet } from "@/components/crm/LeadSheet";
import { BRANCHES, ALL_BRANCH_ROLES, ROLES } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  LogOut,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Stethoscope,
  Handshake,
  Settings,
  BarChart3,
  UserCheck,
  SlidersHorizontal,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { to: "/leads", label: "Пациенты", icon: Users },
  { to: "/surgery", label: "Хирургия", icon: Stethoscope },
  { to: "/checkup", label: "Чекап — 2 этаж", icon: ClipboardCheck },
  { to: "/partners", label: "Агенты", icon: Handshake },
  { to: "/admins", label: "Админы", icon: UserCheck },
  { to: "/reports", label: "Отчёты", icon: BarChart3 },
  { to: "/settings", label: "Настройки", icon: SlidersHorizontal },
] as const;

function Shell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      await supabase.rpc("claim_first_admin");
      const { data: u } = await supabase.auth.getUser();
      const email = (u.user?.email ?? "").toLowerCase();
      const { data } = await supabase
        .from("employees")
        .select("*")
        .ilike("email", email)
        .eq("active", true)
        .maybeSingle();
      return { email, emp: data };
    },
  });
  const [branch, setBranchState] = useState("all");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [preset, setPreset] = useState<NewLeadPreset | null>(null);

  const emp = meQ.data?.emp;
  useEffect(() => {
    if (!emp) return;
    const saved = localStorage.getItem("nova-branch");
    const allowed = ALL_BRANCH_ROLES.includes(emp.role)
      ? ["all", ...BRANCHES.map((b) => b.code)]
      : emp.branch_codes;
    setBranchState(saved && allowed.includes(saved) ? saved : (allowed[0] ?? "all"));
  }, [emp]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (meQ.isLoading)
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Загрузка…</div>
    );
  if (!emp)
    return (
      <div className="grid min-h-screen place-items-center bg-sidebar px-4">
        <div className="max-w-sm rounded-2xl bg-card p-8 text-center">
          <div className="font-display text-xl font-bold">Нет доступа</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Адреса {meQ.data?.email} нет в списке сотрудников. Обратитесь к РОП.
          </p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            Выйти
          </Button>
        </div>
      </div>
    );

  const isAdmin = emp.role === "rop" || emp.role === "commercial_director";
  const branchOptions = ALL_BRANCH_ROLES.includes(emp.role)
    ? BRANCHES
    : BRANCHES.filter((b) => emp.branch_codes.includes(b.code));
  const setBranch = (b: string) => {
    setBranchState(b);
    localStorage.setItem("nova-branch", b);
  };

  return (
    <CrmContext.Provider
      value={{
        me: emp,
        isAdmin,
        branch,
        setBranch,
        openLead: (id) => {
          setPreset(null);
          setLeadId(id);
        },
        newLead: (p) => {
          setLeadId(null);
          setPreset(p ?? {});
        },
      }}
    >
      <div className="min-h-screen bg-background md:flex">
        <aside className="z-30 flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64">
          <div className="px-5 pt-6 pb-4">
            <Link to="/dashboard" className="block font-display text-lg font-bold leading-tight">
              Nova CRM
            </Link>
            <div className="text-xs text-sidebar-foreground/60">{ROLES[emp.role]}</div>
          </div>
          <div className="space-y-2 px-3 pb-3">
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-10 w-full border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_BRANCH_ROLES.includes(emp.role) && (
                  <SelectItem value="all">Все филиалы</SelectItem>
                )}
                {branchOptions.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              onClick={() => {
                setLeadId(null);
                setPreset({});
              }}
            >
              <Plus className="size-4" /> Новая заявка
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 shrink-0"
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary font-medium" }}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 shrink-0"
                activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary font-medium" }}
              >
                <Settings className="size-4" />
                Сотрудники
              </Link>
            )}
          </nav>
          <div className="hidden px-5 pb-5 md:block">
            <button
              onClick={signOut}
              className="mb-3 flex w-full items-center justify-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" /> Выйти
            </button>
            <div className="truncate text-xs text-sidebar-foreground/60">{emp.email}</div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-10">
          <Outlet />
        </main>
        <LeadSheet
          leadId={leadId}
          preset={preset}
          onClose={() => {
            setLeadId(null);
            setPreset(null);
          }}
          onCreated={(id) => {
            setPreset(null);
            setLeadId(id);
          }}
        />
      </div>
    </CrmContext.Provider>
  );
}
