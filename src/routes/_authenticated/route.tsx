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
  Kanban,
  List,
  CheckSquare,
  Stethoscope,
  Handshake,
  Settings,
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
  { to: "/funnel", label: "Воронка", icon: Kanban },
  { to: "/leads", label: "Заявки", icon: List },
  { to: "/tasks", label: "Задачи", icon: CheckSquare },
  { to: "/sales", label: "Отдел продаж", icon: Stethoscope },
  { to: "/partners", label: "Партнёры", icon: Handshake },
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
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Link to="/funnel" className="font-display text-lg font-bold text-sidebar-primary">
              Nova CRM
            </Link>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9 w-[210px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
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
              size="sm"
              className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              onClick={() => {
                setLeadId(null);
                setPreset({});
              }}
            >
              <Plus className="size-4" /> Заявка
            </Button>
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="hidden text-sidebar-foreground/70 sm:inline">
                {emp.full_name || emp.email} · {ROLES[emp.role]}
              </span>
              <button
                onClick={signOut}
                aria-label="Выйти"
                className="rounded-md p-1.5 hover:bg-sidebar-accent"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent"
                activeProps={{
                  className: "bg-sidebar-accent !text-sidebar-foreground font-medium",
                }}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent"
                activeProps={{
                  className: "bg-sidebar-accent !text-sidebar-foreground font-medium",
                }}
              >
                <Settings className="size-4" />
                Админка
              </Link>
            )}
          </nav>
        </header>
        <main className="p-4">
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
