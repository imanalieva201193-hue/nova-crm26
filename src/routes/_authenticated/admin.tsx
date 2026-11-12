/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCrm } from "@/components/crm/context";
import { employeesQ } from "@/components/crm/data";
import { BRANCHES, ROLES, parseCSV } from "@/lib/crm";
import type { Database } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Админка — Nova CRM" },
      { name: "description", content: "Сотрудники, доступы и загрузка справочника из CSV." },
      { property: "og:title", content: "Админка — Nova CRM" },
      { property: "og:description", content: "Сотрудники, доступы и загрузка справочника из CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});
type Row = { [k: string]: any } & {
  name?: any;
  full_name?: any;
  code?: any;
  currency?: any;
  status?: any;
  branch_code?: any;
};
type Role = Database["public"]["Enums"]["app_role"];
const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function AdminPage() {
  const { isAdmin } = useCrm();
  if (!isAdmin)
    return (
      <p className="text-muted-foreground">Раздел доступен только РОП и коммерческому директору.</p>
    );
  return (
    <div className="space-y-6">
      <Employees />
      <CsvImport />
    </div>
  );
}

function Employees() {
  const qc = useQueryClient();
  const list = useQuery(employeesQ).data ?? [];
  const [n, setN] = useState({
    email: "",
    full_name: "",
    role: "operator" as Role,
    branch_codes: [] as string[],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["employees"] });
  async function add() {
    if (!n.email.includes("@")) {
      toast.error("Введите email");
      return;
    }
    const { error } = await supabase
      .from("employees")
      .insert({ ...n, email: n.email.trim().toLowerCase() });
    if (error) {
      toast.error(error.message);
      return;
    }
    setN({ email: "", full_name: "", role: "operator", branch_codes: [] });
    refresh();
  }
  async function upd(
    id: string,
    patch: Partial<{ role: Role; active: boolean; branch_codes: string[] }>,
  ) {
    const { error } = await supabase.from("employees").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  const BranchPick = ({ v, on }: { v: string[]; on: (x: string[]) => void }) => (
    <div className="flex flex-wrap gap-2">
      {BRANCHES.map((b) => (
        <label key={b.code} className="flex items-center gap-1 text-xs">
          <Checkbox
            checked={v.includes(b.code)}
            onCheckedChange={(c) => on(c ? [...v, b.code] : v.filter((x) => x !== b.code))}
          />
          {b.short}
        </label>
      ))}
    </div>
  );
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 font-display text-lg font-bold">Сотрудники и доступы</h2>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3">
        <Input
          className="w-56"
          placeholder="email (Google)"
          value={n.email}
          onChange={(e) => setN({ ...n, email: e.target.value })}
        />
        <Input
          className="w-48"
          placeholder="Имя"
          value={n.full_name}
          onChange={(e) => setN({ ...n, full_name: e.target.value })}
        />
        <select
          className={sel}
          value={n.role}
          onChange={(e) => setN({ ...n, role: e.target.value as Role })}
        >
          {Object.entries(ROLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <BranchPick v={n.branch_codes} on={(b) => setN({ ...n, branch_codes: b })} />
        <Button onClick={add}>Добавить</Button>
      </div>
      <div className="divide-y text-sm">
        {list.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="w-64">
              <div className="font-medium">{e.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{e.email}</div>
            </div>
            <select
              className={sel}
              value={e.role}
              onChange={(x) => upd(e.id, { role: x.target.value as Role })}
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <BranchPick v={e.branch_codes} on={(b) => upd(e.id, { branch_codes: b })} />
            <label className="ml-auto flex items-center gap-1.5 text-xs">
              <Checkbox checked={e.active} onCheckedChange={(c) => upd(e.id, { active: !!c })} />
              Активен
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

const TABLES = {
  services: {
    label: "Прайс (services.csv)",
    num: ["price"],
    bool: ["price_from", "is_new"],
    arr: ["branch_codes"],
  },
  doctors: { label: "Врачи (doctors.csv)", num: [], bool: [], arr: [] },
  packages: {
    label: "Пакеты (packages.csv)",
    num: ["price_separately", "package_price"],
    bool: [],
    arr: [],
  },
  operations: { label: "Операции (operations.csv)", num: [], bool: [], arr: [] },
  drips: { label: "Капельницы (drips.csv)", num: [], bool: [], arr: [] },
  branches: { label: "Филиалы (branches.csv)", num: [], bool: [], arr: ["funnels"] },
} as const;
type T = keyof typeof TABLES;
const COLS: Record<T, string[]> = {
  services: [
    "branch_codes",
    "direction",
    "subsection",
    "doctor_text",
    "name",
    "price",
    "price_text",
    "currency",
    "price_from",
    "note",
    "is_new",
  ],
  doctors: [
    "branch_code",
    "full_name",
    "specialty",
    "schedule",
    "duration",
    "patient_age",
    "experience",
    "status",
    "indications",
    "extra",
  ],
  packages: ["branch_code", "name", "includes", "price_separately", "package_price", "benefit"],
  operations: [
    "name",
    "description",
    "anesthesia",
    "duration",
    "primary_rehab",
    "recovery",
    "indications",
    "contraindications",
  ],
  drips: ["name", "price_text", "course", "indications", "effect", "manufacturer"],
  branches: ["code", "name", "address", "profile", "funnels"],
};

function CsvImport() {
  const qc = useQueryClient();
  const [table, setTable] = useState<T>("services");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  async function onFile(file: File) {
    const raw = parseCSV(await file.text());
    const cfg = TABLES[table];
    const clean = raw
      .map((r) => {
        const o: Row = {};
        for (const c of COLS[table]) {
          if (/dosage|дозировк/i.test(c)) continue;
          let v: unknown = r[c] ?? "";
          if ((cfg.num as readonly string[]).includes(c)) {
            const n = Number(
              String(v)
                .replace(/[^\d.,-]/g, "")
                .replace(",", "."),
            );
            v = String(v).trim() && !isNaN(n) ? n : null;
          } else if ((cfg.bool as readonly string[]).includes(c))
            v = /^(1|true|да|yes|\+)$/i.test(String(v));
          else if ((cfg.arr as readonly string[]).includes(c))
            v = String(v)
              .split(";")
              .map((x) => x.trim())
              .filter(Boolean);
          else v = String(v) || null;
          o[c] = v;
        }
        if (table === "services" && !o.currency) o.currency = "KGS";
        if (table === "doctors" && !o.status) o.status = "Работает";
        return o;
      })
      .filter((o) => o.name || o.full_name || o.code);
    setRows(clean);
  }
  async function apply() {
    setBusy(true);
    try {
      if (table === "doctors") {
        const { data: existing } = await supabase
          .from("doctors")
          .select("id, full_name, branch_code");
        for (const r of rows) {
          const ex = existing?.find(
            (d) => d.full_name === r.full_name && (d.branch_code ?? "") === (r.branch_code ?? ""),
          );
          const res = ex
            ? await supabase
                .from("doctors")
                .update(r as never)
                .eq("id", ex.id)
            : await supabase.from("doctors").insert(r as never);
          if (res.error) throw res.error;
        }
      } else if (table === "branches") {
        const { error } = await supabase.from("branches").upsert(rows as never);
        if (error) throw error;
      } else {
        const del = await supabase.from(table).delete().not("id", "is", null);
        if (del.error) throw del.error;
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from(table).insert(rows.slice(i, i + 500) as never);
          if (error) throw error;
        }
      }
      toast.success(`Загружено строк: ${rows.length}`);
      setRows([]);
      qc.invalidateQueries();
    } catch (e) {
      toast.error("Ошибка загрузки: " + (e as Error).message);
    }
    setBusy(false);
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-1 font-display text-lg font-bold">Загрузить CSV</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Прайс, пакеты, операции и капельницы заменяются целиком; врачи обновляются по ФИО и филиалу.
        Столбец дозировок не загружается. Разделитель — «;» или «,». В branch_codes несколько
        филиалов через «;» внутри кавычек.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={sel}
          value={table}
          onChange={(e) => {
            setTable(e.target.value as T);
            setRows([]);
          }}
        >
          {Object.entries(TABLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <Input
          type="file"
          accept=".csv,text/csv"
          className="w-72"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm">
            Предпросмотр: <b>{rows.length}</b> строк. Первые 5:
          </p>
          <div className="overflow-x-auto rounded-lg border text-xs">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  {COLS[table].map((c) => (
                    <th key={c} className="px-2 py-1 text-left">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t">
                    {COLS[table].map((c) => (
                      <td key={c} className="max-w-48 truncate px-2 py-1">
                        {JSON.stringify(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button className="mt-3" disabled={busy} onClick={apply}>
            {busy
              ? "Загружаю…"
              : table === "doctors" || table === "branches"
                ? "Обновить"
                : "Заменить целиком"}
          </Button>
        </div>
      )}
    </section>
  );
}
