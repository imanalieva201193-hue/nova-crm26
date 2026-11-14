import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { partnersQ, employeesQ } from "./data";
import { useCrm } from "./context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { exportWorkbook } from "./workspace-export";
export function PartnerBase({ segment, region = "" }: { segment: string; region?: string }) {
  const { isAdmin } = useCrm();
  const qc = useQueryClient();
  const q = useQuery(partnersQ);
  const employees = useQuery(employeesQ).data ?? [];
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newRegion, setNewRegion] = useState(region);
  const [curator, setCurator] = useState("");
  const [status, setStatus] = useState("");
  const rows = (q.data ?? []).filter(
    (p) =>
      (segment === "B2B" ? p.type === "B2B" : p.type !== "B2B") &&
      (!region || p.region === region) &&
      (!search ||
        [p.name, p.clinic, p.city, p.phone, p.specialty, p.notes]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!status || p.status === status) &&
      (!curator || p.curator_email === curator),
  );
  async function add() {
    if (!name.trim()) return;
    const r = await supabase.from("partners").insert({
      name: name.trim(),
      type: segment === "B2B" ? "B2B" : "Агент",
      phone: phone.trim() || null,
      region: newRegion || null,
      curator_email: curator || null,
    });
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    setName("");
    setPhone("");
    await qc.invalidateQueries({ queryKey: ["partners"] });
  }
  async function update(
    id: string,
    patch: {
      status?: string;
      curator_email?: string;
      region?: string | null;
      notes?: string;
      phone?: string;
      name?: string;
      city?: string;
    },
  ) {
    const r = await supabase.from("partners").update(patch).eq("id", id);
    if (r.error) toast.error(r.error.message);
    else await qc.invalidateQueries({ queryKey: ["partners"] });
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Поиск партнёров"
          placeholder="Имя, телефон, организация"
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
                Телефон: p.phone,
                Email: p.email,
                Регион: p.region,
                Город: p.city,
                Адрес: p.address,
                Примечания: p.notes,
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
      <p className="text-sm text-muted-foreground">Партнёров: {rows.length}</p>
      {q.isError && <p className="text-destructive">Не удалось загрузить партнёров</p>}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Новый партнёр"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label="Телефон нового партнёра"
            className="sm:w-52"
            placeholder="Телефон"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <select
            aria-label="Регион нового партнёра"
            className="rounded-md border border-input bg-card p-2"
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value)}
          >
            <option value="">Регион не указан</option>
            <option>Алматы</option>
            <option>Бишкек</option>
            <option>Области</option>
          </select>
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
              <th>Контакты</th>
              <th>Регион</th>
              <th>Статус</th>
              <th>Примечания</th>
              <th>Ответственный</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="min-w-52 p-3">
                  <Input
                    aria-label={`Имя ${p.name}`}
                    disabled={!isAdmin}
                    defaultValue={p.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value.trim() !== p.name)
                        update(p.id, { name: e.target.value.trim() });
                    }}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">{p.specialty}</div>
                </td>
                <td className="min-w-48 p-2">
                  {p.clinic || "—"}
                  <div className="mt-1 text-xs text-muted-foreground">{p.address}</div>
                </td>
                <td className="min-w-44 p-2">
                  <Input
                    aria-label={`Телефон ${p.name}`}
                    disabled={!isAdmin}
                    defaultValue={p.phone || ""}
                    onBlur={(e) => {
                      if (e.target.value !== (p.phone || ""))
                        update(p.id, { phone: e.target.value });
                    }}
                  />
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </td>
                <td className="p-2">
                  <select
                    aria-label={`Регион ${p.name}`}
                    disabled={!isAdmin}
                    className="rounded-md border border-input bg-card p-2"
                    value={p.region || ""}
                    onChange={(e) => update(p.id, { region: e.target.value || null })}
                  >
                    <option value="">Не указан</option>
                    <option>Алматы</option>
                    <option>Бишкек</option>
                    <option>Области</option>
                  </select>
                  <div className="text-xs text-muted-foreground">{p.city}</div>
                </td>
                <td>
                  <select
                    disabled={!isAdmin}
                    aria-label={`Статус ${p.name}`}
                    className="rounded-md border border-input bg-card p-2"
                    value={p.status || "Активен"}
                    onChange={(e) => update(p.id, { status: e.target.value })}
                  >
                    {p.status && !["Активен", "Неактивен"].includes(p.status) && (
                      <option>{p.status}</option>
                    )}
                    <option>Активен</option>
                    <option>Неактивен</option>
                    {[
                      ...new Set(
                        (q.data ?? [])
                          .map((p) => p.status)
                          .filter((s) => s && !["Активен", "Неактивен"].includes(s)),
                      ),
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                    <option>Не контактировали</option>
                    <option>Первый контакт</option>
                    <option>Переговоры</option>
                    <option>Отказ</option>
                  </select>
                </td>
                <td className="min-w-64 p-2">
                  <textarea
                    aria-label={`Примечания ${p.name}`}
                    disabled={!isAdmin}
                    className="h-24 w-full rounded-md border border-input bg-card p-2 text-xs"
                    defaultValue={p.notes || ""}
                    onBlur={(e) => {
                      if (e.target.value !== (p.notes || ""))
                        update(p.id, { notes: e.target.value });
                    }}
                  />
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
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {q.isLoading ? "Загрузка…" : "Нет партнёров"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
