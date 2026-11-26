import { createFileRoute, Link } from "@tanstack/react-router";
import { useCrm } from "@/components/crm/context";
import { BRANCHES, FUNNELS, ROLES, stageList, type FunnelCode } from "@/lib/crm";
import { SectionNames } from "@/components/crm/SectionNames";
import { useLabels } from "@/components/crm/labels";
import { Chat2deskIntegration } from "@/components/crm/Chat2deskIntegration";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — Nova CRM" },
      { name: "description", content: "Профиль, филиал по умолчанию и этапы воронок." },
      { property: "og:title", content: "Настройки — Nova CRM" },
      { property: "og:description", content: "Профиль, филиал по умолчанию и этапы воронок." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const labels = useLabels();
  const { me, branch, setBranch, isAdmin } = useCrm();
  const sel = "h-10 rounded-md border border-input bg-card px-3 text-sm";
  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Система
        </div>
        <h1 className="font-display text-4xl font-bold">{labels["settings"]}</h1>
      </div>
      {isAdmin && <SectionNames />}
      {isAdmin && <Chat2deskIntegration />}
      {isAdmin && <section className="space-y-3 border-b pb-6"><h2 className="font-display text-xl font-bold">Altegio</h2><Button variant="outline" asChild><Link to="/altegio">Записи, отчёты и подключение →</Link></Button></section>}
      <section className="space-y-2 border-b pb-6">
        <h2 className="font-display text-xl font-bold">Профиль</h2>
        <div className="text-sm">
          {me.full_name || "—"} · {me.email}
        </div>
        <div className="text-sm text-muted-foreground">Роль: {ROLES[me.role]}</div>
        <div className="text-sm text-muted-foreground">
          Филиалы:{" "}
          {BRANCHES.filter((b) => me.branch_codes.includes(b.code))
            .map((b) => b.short)
            .join(", ") || "все"}
        </div>
      </section>
      <section className="space-y-2 border-b pb-6">
        <h2 className="font-display text-xl font-bold">Филиал по умолчанию</h2>
        <select className={sel} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="all">Все филиалы</option>
          {BRANCHES.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
      </section>
      <section className="space-y-3 border-b pb-6">
        <h2 className="font-display text-xl font-bold">Этапы воронок</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(FUNNELS) as FunnelCode[]).map((k) => (
            <div key={k} className="rounded-2xl border p-4">
              <div className="mb-2 font-semibold">{FUNNELS[k].name}</div>
              <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                {stageList(k).map((s) => (
                  <li key={s.n}>{s.label}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
      {isAdmin && (
        <Link to="/admin" className="text-sm font-medium text-primary hover:underline">
          Сотрудники, доступы и загрузка справочников →
        </Link>
      )}
    </div>
  );
}
