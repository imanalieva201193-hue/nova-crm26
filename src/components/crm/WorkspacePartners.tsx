import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { partnersQ, employeesQ } from "./data";
import { useCrm } from "./context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { exportWorkbook } from "./workspace-export";
export function PartnerBase({ segment }: { segment: string }) {
  const { isAdmin } = useCrm();
  const qc = useQueryClient();
  const q = useQuery(partnersQ);
  const employees = useQuery(employeesQ).data ?? [];
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [curator, setCurator] = useState("");
  const [status, setStatus] = useState("");
  const rows = (q.data ?? []).filter(
    (p) =>
      (segment === "B2B" ? p.type === "B2B" : p.type !== "B2B") &&
      (!search ||
        [p.name, p.clinic, p.city].join(" ").toLowerCase().includes(search.toLowerCase())) &&
      (!status || p.status === status) &&
      (!curator || p.curator_email === curator),
  );
  async function add() {
    if (!name.trim()) return;
    const r = await supabase.from("partners").insert({
      name: name.trim(),
      type: segment === "B2B" ? "B2B" : "Агент",
      curator_email: curator || null,
    });
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    setName("");
    await qc.invalidateQueries({ queryKey: ["partners"] });
  }
  async function update(id: string, patch: { status?: string; curator_email?: string }) {
    const r = await supabase.from("partners").update(patch).eq("id", id);
    if (r.error) toast.error(r.error.message);
    else await qc.invalidateQueries({ queryKey: ["partners"] });
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Поиск партнёров"
          placeholder="Имя, организация, город"
          className="sm:w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() =>
            exportWorkbook("NOVA_партнёры", {
              Партнёры: rows.map((p) => ({
                Имя: p.name,
                Тип: p.type,
                Организация: p.clinic,
                Статус: p.status,
                Ответственный: p.curator_email,
              })),
            })
          }
        >
          Excel
        </Button>
        <select
          aria-label="Статус партнёра"
          className="rounded-md border border-input bg-card p-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Все статусы</option>
          <option>Активен</option>
          <option>Неактивен</option>
        </select>
        <select
          aria-label="Куратор"
          className="rounded-md border border-input bg-card p-2"
          value={curator}
          onChange={(e) => setCurator(e.target.value)}
        >
          <option value="">Все ответственные</option>
          {employees.map((e) => (
            <option key={e.id} value={e.email}>
              {e.full_name || e.email}
            </option>
          ))}
        </select>
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <Input
            placeholder="Новый партнёр"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={add} disabled={!name.trim()}>
            Добавить партнёра
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Партнёр</th>
              <th>Организация</th>
              <th>Статус</th>
              <th>Ответственный</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-3">{p.name}</td>
                <td>{p.clinic || "—"}</td>
                <td>
                  <select
                    disabled={!isAdmin}
                    aria-label={`Статус ${p.name}`}
                    className="rounded-md border border-input bg-card p-2"
                    value={p.status || "Активен"}
                    onChange={(e) => update(p.id, { status: e.target.value })}
                  >
                    <option>Активен</option>
                    <option>Неактивен</option>
                  </select>
                </td>
                <td>
                  <select
                    disabled={!isAdmin}
                    aria-label={`Ответственный ${p.name}`}
                    className="rounded-md border border-input bg-card p-2"
                    value={p.curator_email || ""}
                    onChange={(e) => update(p.id, { curator_email: e.target.value })}
                  >
                    <option value="">Без ответственного</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.email}>
                        {e.full_name || e.email}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  Нет партнёров
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
