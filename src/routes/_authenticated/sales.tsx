import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCrm } from "@/components/crm/context";
import { servicesQ, useDoctors, type Service } from "@/components/crm/data";
import {
  branchName,
  estimateTotals,
  fmtMoney,
  patientText,
  totalsText,
  type EstimateItem,
} from "@/lib/crm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Отдел продаж — Nova CRM" },
      {
        name: "description",
        content: "Прайс, расчёт для пациента, врачи, операции, пакеты и база знаний.",
      },
      { property: "og:title", content: "Отдел продаж — Nova CRM" },
      {
        property: "og:description",
        content: "Прайс, расчёт для пациента, врачи, операции, пакеты и база знаний.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});
const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";
type Item = EstimateItem & { service_id?: string };

function SalesPage() {
  const { branch, newLead } = useCrm();
  const [tab, setTab] = useState("price");
  const [cart, setCart] = useState<Item[]>([]);
  const [foreigner, setForeigner] = useState(false);
  const [priceFilter, setPriceFilter] = useState({ q: "", doctor: "" });
  const add = (s: Service) =>
    setCart((c) => [
      ...c,
      {
        service_id: s.id,
        name: s.name,
        qty: 1,
        price: Number(s.price ?? 0),
        currency: s.currency,
        price_from: s.price_from,
      },
    ]);
  const text = patientText(cart, foreigner, branch !== "all" ? branch : undefined);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {[
            ["price", "Прайс"],
            ["doctors", "Врачи"],
            ["ops", "Операции"],
            ["packages", "Пакеты"],
            ["drips", "Капельницы"],
            ["kb", "База знаний"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v!}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="price">
          <PriceTab onAdd={add} filter={priceFilter} setFilter={setPriceFilter} />
        </TabsContent>
        <TabsContent value="doctors">
          <DoctorsTab
            onPrices={(name) => {
              setPriceFilter({ q: "", doctor: name });
              setTab("price");
            }}
          />
        </TabsContent>
        <TabsContent value="ops">
          <OpsTab
            onFind={(name) => {
              setPriceFilter({ q: name, doctor: "" });
              setTab("price");
            }}
          />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesTab
            onAdd={(p) =>
              setCart((c) => [
                ...c,
                { name: p.name, qty: 1, price: p.price, currency: "KGS", is_package: true },
              ])
            }
          />
        </TabsContent>
        <TabsContent value="drips">
          <DripsTab />
        </TabsContent>
        <TabsContent value="kb">
          <KbTab />
        </TabsContent>
      </Tabs>
      <aside className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-28">
        <h2 className="mb-2 font-display text-base font-bold">Расчёт для пациента</h2>
        <div className="divide-y text-sm">
          {cart.map((i, k) => (
            <div key={k} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">{i.name}</span>
              <Input
                type="number"
                min={1}
                className="h-7 w-12"
                value={i.qty}
                onChange={(e) =>
                  setCart(
                    cart.map((c, j) =>
                      j === k ? { ...c, qty: Math.max(1, Number(e.target.value)) } : c,
                    ),
                  )
                }
                aria-label="Количество"
              />
              <button aria-label="Убрать" onClick={() => setCart(cart.filter((_, j) => j !== k))}>
                <Trash2 className="size-4 text-muted-foreground" />
              </button>
            </div>
          ))}
          {!cart.length && (
            <p className="py-2 text-muted-foreground">Нажмите «+» у услуги в прайсе</p>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={foreigner} onCheckedChange={(v) => setForeigner(!!v)} />
          Иностранный пациент (+10%)
        </label>
        <div className="mt-3 text-lg font-bold text-primary">
          {totalsText(estimateTotals(cart, foreigner))}
        </div>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">
          {text}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!cart.length}
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.success("Текст скопирован");
            }}
          >
            <Copy className="size-4" />
            Скопировать
          </Button>
          <Button
            size="sm"
            disabled={!cart.length}
            onClick={() =>
              newLead({
                items: cart,
                foreigner,
                branch_code: branch !== "all" ? branch : undefined,
              })
            }
          >
            Создать заявку
          </Button>
        </div>
      </aside>
    </div>
  );
}

function PriceTab({
  onAdd,
  filter,
  setFilter,
}: {
  onAdd: (s: Service) => void;
  filter: { q: string; doctor: string };
  setFilter: (f: { q: string; doctor: string }) => void;
}) {
  const { branch } = useCrm();
  const services = useQuery(servicesQ).data ?? [];
  const [dir, setDir] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const inBranch = services.filter((s) => branch === "all" || s.branch_codes.includes(branch));
  const dirs = [...new Set(inBranch.map((s) => s.direction ?? ""))].filter(Boolean);
  const rows = inBranch.filter(
    (s) =>
      (!dir || s.direction === dir) &&
      (!onlyNew || s.is_new) &&
      (!filter.q || s.name.toLowerCase().includes(filter.q.toLowerCase())) &&
      (!filter.doctor ||
        (s.doctor_text ?? "").toLowerCase().includes(filter.doctor.split(" ")[0]!.toLowerCase())),
  );
  const groups = useMemo(() => {
    const m = new Map<string, Service[]>();
    rows.forEach((s) => {
      const k = [s.direction, s.subsection].filter(Boolean).join(" · ") || "Прочее";
      m.set(k, [...(m.get(k) ?? []), s]);
    });
    return [...m];
  }, [rows]);
  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder="Поиск услуги"
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
        />
        <select className={sel} value={dir} onChange={(e) => setDir(e.target.value)}>
          <option value="">Все направления</option>
          {dirs.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {filter.doctor && (
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setFilter({ ...filter, doctor: "" })}
          >
            Врач: {filter.doctor} ✕
          </Badge>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyNew} onCheckedChange={(v) => setOnlyNew(!!v)} />
          Только новое
        </label>
      </div>
      {inBranch.length < 20 && (
        <p className="mb-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          Полный прайс ещё не загружен — РОП загружает его в Админке из CSV.
        </p>
      )}
      <div className="space-y-4">
        {groups.map(([g, list]) => (
          <section key={g} className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-2 text-sm font-semibold text-primary">{g}</h3>
            {list.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-0"
              >
                <div className="flex-1">
                  {s.name}
                  {s.is_new && <Badge className="ml-2">новое</Badge>}
                  {(s.note || s.doctor_text) && (
                    <div className="text-xs text-muted-foreground">
                      {[s.doctor_text, s.note].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-medium">
                  {s.price_from ? "от " : ""}
                  {s.price_text || fmtMoney(Number(s.price ?? 0), s.currency)}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Добавить в расчёт"
                  onClick={() => onAdd(s)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function DoctorsTab({ onPrices }: { onPrices: (name: string) => void }) {
  const { branch, newLead } = useCrm();
  const doctors = useDoctors();
  const [q, setQ] = useState("");
  const list = doctors.filter(
    (d) =>
      (branch === "all" || d.branch_code === branch) &&
      (!q ||
        [d.full_name, d.specialty, d.indications, d.extra]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  return (
    <div className="mt-3">
      <Input
        className="mb-3 w-80"
        placeholder="Врач, специальность или жалоба («давление»)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((d) => (
          <div
            key={d.id}
            className={
              "rounded-xl border bg-card p-4 " + (d.status === "Декрет" ? "opacity-60" : "")
            }
          >
            <div className="flex justify-between gap-2">
              <div className="font-semibold">{d.full_name}</div>
              <Badge variant={d.status === "Декрет" ? "outline" : "secondary"}>{d.status}</Badge>
            </div>
            <div className="text-sm text-primary">{d.specialty}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {d.branch_code ? branchName(d.branch_code) : "Филиал уточняется"} · {d.schedule}
            </div>
            {(d.duration || d.patient_age || d.experience) && (
              <div className="mt-1 text-xs text-muted-foreground">
                {[
                  d.duration && "приём " + d.duration,
                  d.patient_age && "возраст " + d.patient_age,
                  d.experience && "стаж " + d.experience,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {d.indications && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-primary">С чем обращаться</summary>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.indications}</p>
              </details>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onPrices(d.full_name)}>
                Услуги и цены
              </Button>
              <Button
                size="sm"
                disabled={d.status === "Декрет" || !d.branch_code}
                onClick={() =>
                  newLead({ branch_code: d.branch_code ?? undefined, doctor_id: d.id })
                }
              >
                Записать к врачу
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function useTable<T>(table: "operations" | "packages" | "drips" | "kb_articles") {
  return (useQuery({
    queryKey: [table],
    queryFn: async () => (await supabase.from(table).select("*")).data ?? [],
  }).data ?? []) as T[];
}
const Empty = ({ what }: { what: string }) => (
  <p className="mt-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
    {what} ещё не загружены — РОП загружает их в Админке из CSV.
  </p>
);

function OpsTab({ onFind }: { onFind: (n: string) => void }) {
  const ops = useTable<{
    id: string;
    name: string;
    description: string | null;
    anesthesia: string | null;
    duration: string | null;
    primary_rehab: string | null;
    recovery: string | null;
    indications: string | null;
    contraindications: string | null;
  }>("operations");
  if (!ops.length) return <Empty what="Операции" />;
  return (
    <Accordion type="single" collapsible className="mt-3 rounded-xl border bg-card px-4">
      {ops.map((o) => (
        <AccordionItem key={o.id} value={o.id}>
          <AccordionTrigger>{o.name}</AccordionTrigger>
          <AccordionContent className="space-y-1 text-sm">
            {(
              [
                ["Что это", o.description],
                ["Анестезия", o.anesthesia],
                ["Время", o.duration],
                ["Реабилитация", o.primary_rehab],
                ["Восстановление", o.recovery],
                ["Показания", o.indications],
                ["Противопоказания", o.contraindications],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <p key={k}>
                  <b>{k}:</b> {v}
                </p>
              ))}
            <Button size="sm" variant="outline" onClick={() => onFind(o.name)}>
              Найти в прайсе
            </Button>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function PackagesTab({ onAdd }: { onAdd: (p: { name: string; price: number }) => void }) {
  const pk = useTable<{
    id: string;
    name: string;
    includes: string | null;
    price_separately: number | null;
    package_price: number | null;
    benefit: string | null;
  }>("packages");
  return (
    <div className="mt-3">
      <div className="mb-3 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
        На пакеты дополнительные скидки не действуют · дополнительная зона к пакету — скидка 10% ·
        при рассрочке пакет не действует.
      </div>
      {!pk.length ? (
        <Empty what="Пакеты" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pk.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4">
              <div className="font-semibold">{p.name}</div>
              <p className="mt-1 text-sm text-muted-foreground">{p.includes}</p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-lg font-bold text-primary">
                  {fmtMoney(Number(p.package_price ?? 0))}
                </span>
                <span className="text-sm line-through text-muted-foreground">
                  {fmtMoney(Number(p.price_separately ?? 0))}
                </span>
                <span className="text-sm text-success">{p.benefit}</span>
              </div>
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                onClick={() =>
                  onAdd({ name: "Пакет: " + p.name, price: Number(p.package_price ?? 0) })
                }
              >
                <Plus className="size-4" />В расчёт
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DripsTab() {
  const d = useTable<{
    id: string;
    name: string;
    price_text: string | null;
    course: string | null;
    indications: string | null;
    effect: string | null;
    manufacturer: string | null;
  }>("drips");
  if (!d.length) return <Empty what="Капельницы" />;
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {d.map((x) => (
        <div key={x.id} className="rounded-xl border bg-card p-4 text-sm">
          <div className="flex justify-between font-semibold">
            <span>{x.name}</span>
            <span>{x.price_text}</span>
          </div>
          <p className="text-muted-foreground">
            {[x.course && "Курс: " + x.course, x.indications, x.effect, x.manufacturer]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

function KbTab() {
  const a = useTable<{ id: string; title: string; body: string; sort: number | null }>(
    "kb_articles",
  ).sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {a.map((x) => (
        <article key={x.id} className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold text-primary">{x.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">{x.body}</p>
        </article>
      ))}
    </div>
  );
}
