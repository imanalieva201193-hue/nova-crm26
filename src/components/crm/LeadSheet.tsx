import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  BRANCHES,
  BRANCH_FUNNELS,
  CHANNELS,
  FUNNELS,
  LINES,
  OUTCOMES,
  REANIMATION,
  FINAL,
  NOVA_CHECK_PREPAYMENT,
  NOVA_CHECK_DAILY_LIMIT,
  INSTALLMENT_MAX,
  INSTALLMENT_GUARANTOR_FROM,
  bishkekDate,
  doctorWorksOn,
  estimateTotals,
  fmtDate,
  fmtMoney,
  leadCategory,
  missingForStage,
  normalizePhone,
  shouldSuggestLost,
  stageList,
  totalsText,
  type FunnelCode,
  attributionStamp,
} from "@/lib/crm";
import { partnersQ, servicesQ, useDoctors, useLookups, type Lead } from "./data";
import { useCrm, type NewLeadPreset } from "./context";
import { useServerFn } from "@tanstack/react-start";
import { suggestNextStep } from "@/lib/next-step.functions";
import { Sparkles } from "lucide-react";

type Form = Partial<Lead> & { funnel: string; stage: number; branch_code: string };
const sel = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm";

function Field({
  label,
  children,
  req,
}: {
  label: string;
  children: React.ReactNode;
  req?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {req && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function LeadSheet({
  leadId,
  preset,
  onClose,
  onCreated,
}: {
  leadId: string | null;
  preset: NewLeadPreset | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const open = !!leadId || !!preset;
  const { me, branch } = useCrm();
  const qc = useQueryClient();
  const doctors = useDoctors();
  const sources = useLookups("source");
  const reasons = useLookups("reason");
  const insurances = useLookups("insurance");
  const services = useQuery({ ...servicesQ, enabled: open }).data ?? [];
  const partners = useQuery({ ...partnersQ, enabled: open }).data ?? [];
  const [f, setF] = useState<Form | null>(null);
  const [orig, setOrig] = useState<Form | null>(null);
  const [phoneRaw, setPhoneRaw] = useState("");
  const [reason, setReason] = useState("");
  const [svcSearch, setSvcSearch] = useState("");
  const [touch, setTouch] = useState({ channel: "Звонок", result: "", no_answer: false });
  const [note, setNote] = useState("");
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({
    loading: false,
  });
  const suggestFn = useServerFn(suggestNextStep);
  const [draftItems, setDraftItems] = useState<NonNullable<NewLeadPreset["items"]>>([]);

  const leadQ = useQuery({
    queryKey: ["lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId!).single();
      if (error) throw error;
      return data;
    },
  });
  const itemsQ = useQuery({
    queryKey: ["lead_services", leadId],
    enabled: !!leadId,
    queryFn: async () =>
      (await supabase.from("lead_services").select("*").eq("lead_id", leadId!).order("created_at"))
        .data ?? [],
  });
  const touchesQ = useQuery({
    queryKey: ["touches", leadId],
    enabled: !!leadId,
    queryFn: async () =>
      (
        await supabase
          .from("touches")
          .select("*")
          .eq("lead_id", leadId!)
          .order("touched_at", { ascending: false })
      ).data ?? [],
  });
  const histQ = useQuery({
    queryKey: ["history", leadId],
    enabled: !!leadId,
    queryFn: async () =>
      (
        await supabase
          .from("lead_history")
          .select("*")
          .eq("lead_id", leadId!)
          .order("changed_at", { ascending: false })
      ).data ?? [],
  });

  useEffect(() => {
    if (leadId && leadQ.data) {
      setF(leadQ.data as Form);
      setOrig(leadQ.data as Form);
      setPhoneRaw(leadQ.data.phone);
    } else if (preset && !leadId) {
      const b = preset.branch_code ?? (branch !== "all" ? branch : (me.branch_codes[0] ?? "abd2"));
      const funnel = preset.funnel ?? BRANCH_FUNNELS[b]?.[0] ?? "nova_general";
      setF({
        branch_code: b,
        funnel,
        stage: 1,
        lead_date: bishkekDate(),
        line: me.role === "branch_admin" ? "Филиал" : "Колл-центр",
        doctor_id: preset.doctor_id ?? null,
        foreigner: !!preset.foreigner,
        parent_lead_id: preset.parent_lead_id ?? null,
        patient_name: preset.patient_name ?? "",
        responsible_email: me.email,
      });
      setOrig(null);
      setPhoneRaw(preset.phone ?? "");
      setDraftItems(preset.items ?? []);
    }
    setReason("");
    setAi({ loading: false });
  }, [leadId, leadQ.data, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = leadId
    ? (itemsQ.data ?? [])
    : draftItems.map((i, k) => ({
        ...i,
        id: String(k),
        discount: i.discount ?? 0,
        is_package: !!i.is_package,
        price_from: !!i.price_from,
      }));
  const totals = estimateTotals(items, !!f?.foreigner);
  const branchDoctors = doctors.filter((d) => d.branch_code === f?.branch_code);
  const doctor = doctors.find((d) => d.id === f?.doctor_id);
  const funnelDef = f ? FUNNELS[f.funnel as FunnelCode] : null;
  const svcResults = useMemo(() => {
    if (!f || svcSearch.length < 2) return [];
    const s = svcSearch.toLowerCase();
    return services
      .filter(
        (x) =>
          x.branch_codes.includes(f.branch_code) &&
          (x.name + " " + (x.direction ?? "")).toLowerCase().includes(s),
      )
      .slice(0, 12);
  }, [services, svcSearch, f]);

  if (!f)
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Загрузка…</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

  const set = (patch: Partial<Form>) => setF({ ...f, ...patch });
  const warnings: string[] = [];
  if (f.visit_date && doctor && !doctorWorksOn(doctor.schedule, f.visit_date))
    warnings.push(`Врач не принимает в этот день по графику: ${doctor.schedule}`);
  if (f.visit_date && f.lead_date && f.visit_date.slice(0, 10) < f.lead_date)
    warnings.push("Дата визита раньше даты заявки");
  if (f.installment && items.some((i) => i.is_package))
    warnings.push("При рассрочке пакет не действует — замените пакет услугами по отдельности");
  if (f.installment && totals.kgs > INSTALLMENT_MAX)
    warnings.push(`Рассрочка — максимум ${fmtMoney(INSTALLMENT_MAX)}`);
  if (
    f.insurance &&
    items.some((i) =>
      /пластич|космет/i.test(
        services.find((s) => s.id === (i as { service_id?: string | null }).service_id)
          ?.direction ?? i.name,
      ),
    )
  )
    warnings.push("Страховка не покрывает услуги красоты (пластика, косметология)");
  if (
    funnelDef?.surgery &&
    items.length &&
    !items.some((i) => /наркоз|анестез|седац|ПИТ|палат/i.test(i.name))
  )
    warnings.push("Хирургическая смета: не забудьте добавить анестезию и стационар");
  if (leadId && shouldSuggestLost(touchesQ.data ?? []))
    warnings.push("3 попытки без ответа за 3 дня — закройте лид как «Потерянный»");

  async function save(extra: Partial<Form> = {}) {
    const next = { ...f!, ...extra };
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      toast.error("Телефон: введите номер в формате 0555 123 456");
      return;
    }
    next.phone = phone;
    const miss = next.outcome ? missingForStage(next, 1) : missingForStage(next, next.stage);
    if (miss.length) {
      toast.error("Заполните: " + miss.join(", "));
      return;
    }
    if (
      next.funnel === "nova_check" &&
      next.stage >= 3 &&
      next.stage !== REANIMATION &&
      next.visit_date
    ) {
      const day = next.visit_date.slice(0, 10);
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("funnel", "nova_check")
        .is("outcome", null)
        .gte("stage", 3)
        .gte("visit_date", day + "T00:00:00+06:00")
        .lte("visit_date", day + "T23:59:59+06:00");
      if ((data ?? []).filter((x) => x.id !== next.id).length >= NOVA_CHECK_DAILY_LIMIT) {
        toast.error(
          `На ${fmtDate(day)} уже ${NOVA_CHECK_DAILY_LIMIT} чекапа — выберите другую дату`,
        );
        return;
      }
    }
    Object.assign(next, attributionStamp(next, me.email));
    if (!leadId) {
      const { data: dup } = await supabase
        .from("leads")
        .select("id, patient_name")
        .eq("phone", phone)
        .limit(1);
      if (dup?.length) {
        toast.info(
          `Пациент с этим номером уже есть (${dup[0]!.patient_name || "без имени"}) — открыта его карточка`,
        );
        onCreated(dup[0]!.id);
        return;
      }
      const { id: _id, created_at: _c, ...payload } = next as Lead;
      const { data, error } = await supabase
        .from("leads")
        .insert(payload as TablesInsert<"leads">)
        .select("id")
        .single();
      if (error) {
        toast.error("Не сохранилось: " + error.message);
        return;
      }
      if (draftItems.length)
        await supabase.from("lead_services").insert(
          draftItems.map((i) => ({
            lead_id: data.id,
            service_id: i.service_id ?? null,
            name: i.name,
            qty: i.qty,
            price: i.price,
            currency: i.currency,
            price_from: !!i.price_from,
            discount: i.discount ?? 0,
            is_package: !!i.is_package,
          })),
        );
      await supabase
        .from("lead_history")
        .insert({ lead_id: data.id, author_email: me.email, changes: { создано: true } });
      toast.success("Заявка создана");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onCreated(data.id);
      return;
    }
    const changes: Record<string, unknown> = {};
    for (const k of Object.keys(next) as (keyof Form)[])
      if (JSON.stringify(next[k]) !== JSON.stringify(orig?.[k])) changes[k] = next[k];
    if (!Object.keys(changes).length) {
      toast("Без изменений");
      return;
    }
    const { error } = await supabase
      .from("leads")
      .update(changes as never)
      .eq("id", leadId);
    if (error) {
      toast.error("Не сохранилось: " + error.message);
      return;
    }
    await supabase
      .from("lead_history")
      .insert({ lead_id: leadId, author_email: me.email, changes: changes as never });
    toast.success("Сохранено");
    setF(next);
    setOrig(next);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["history", leadId] });
  }

  async function addItem(s: (typeof services)[number]) {
    const item = {
      service_id: s.id,
      name: s.name,
      qty: 1,
      price: Number(s.price ?? 0),
      currency: s.currency,
      price_from: s.price_from,
      discount: 0,
      is_package: false,
    };
    if (leadId) {
      await supabase.from("lead_services").insert({ ...item, lead_id: leadId });
      qc.invalidateQueries({ queryKey: ["lead_services", leadId] });
    } else setDraftItems([...draftItems, item]);
    setSvcSearch("");
  }
  async function updItem(id: string, patch: { qty?: number; discount?: number }) {
    if (leadId) {
      await supabase.from("lead_services").update(patch).eq("id", id);
      qc.invalidateQueries({ queryKey: ["lead_services", leadId] });
    } else setDraftItems(draftItems.map((d, k) => (String(k) === id ? { ...d, ...patch } : d)));
  }
  async function delItem(id: string) {
    if (leadId) {
      await supabase.from("lead_services").delete().eq("id", id);
      qc.invalidateQueries({ queryKey: ["lead_services", leadId] });
    } else setDraftItems(draftItems.filter((_, k) => String(k) !== id));
  }
  async function addTouch() {
    if (!leadId) return;
    await supabase.from("touches").insert({
      lead_id: leadId,
      channel: touch.channel,
      result: touch.result,
      no_answer: touch.no_answer,
      author_email: me.email,
    });
    setTouch({ ...touch, result: "", no_answer: false });
    qc.invalidateQueries({ queryKey: ["touches", leadId] });
  }
  async function addNote() {
    if (!leadId || !note.trim()) return;
    await supabase.from("touches").insert({
      lead_id: leadId,
      channel: "Заметка",
      result: note.trim(),
      no_answer: false,
      author_email: me.email,
    });
    setNote("");
    qc.invalidateQueries({ queryKey: ["touches", leadId] });
  }
  async function askAi() {
    if (!leadId) return;
    setAi({ loading: true });
    try {
      const r = await suggestFn({ data: { leadId } });
      setAi(r.ok ? { loading: false, text: r.text } : { loading: false, error: r.error });
    } catch {
      setAi({ loading: false, error: "Не удалось получить рекомендацию" });
    }
  }
  async function closeAs(outcome: string) {
    if (!reason) {
      toast.error("Выберите причину");
      return;
    }
    await save({ outcome, outcome_reason: reason });
  }
  async function toSurgeon() {
    const target = f!.branch_code === "asanbay" ? "asanbay" : "abd3";
    const { data, error } = await supabase
      .from("leads")
      .insert({
        patient_name: f!.patient_name ?? null,
        phone: f!.phone!,
        source: f!.source ?? "Повторный пациент",
        line: f!.line ?? "Филиал",
        channel: f!.channel ?? null,
        branch_code: target,
        funnel: target === "asanbay" ? "rinos" : "nova_surgery",
        stage: 2,
        parent_lead_id: leadId,
        comment: `Направлен из ${BRANCHES.find((b) => b.code === f!.branch_code)?.name}`,
        responsible_email: me.email,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Создана заявка к хирургу");
    qc.invalidateQueries({ queryKey: ["leads"] });
    onCreated(data.id);
  }

  const stages = stageList(f.funnel as FunnelCode);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-background sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">
            {leadId ? f.patient_name || "Заявка" : "Новая заявка"}
          </SheetTitle>
          {leadId && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{leadCategory(f)}</Badge>
              {f.outcome && (
                <Badge variant="destructive">
                  {f.outcome}: {f.outcome_reason}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>
        <div className="space-y-4 px-4 pb-24">
          {warnings.map((w) => (
            <div
              key={w}
              className="flex gap-2 rounded-lg bg-warning/25 p-2.5 text-sm text-warning-foreground"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {w}
            </div>
          ))}

          <Block title="Пациент и обращение">
            <Field label="Пациент">
              <Input
                value={f.patient_name ?? ""}
                onChange={(e) => set({ patient_name: e.target.value })}
              />
            </Field>
            <Field label="Телефон" req>
              <Input
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                onBlur={() => {
                  const p = normalizePhone(phoneRaw);
                  if (p) setPhoneRaw(p);
                }}
                placeholder="0555 123 456"
              />
            </Field>
            <Field label="Дата заявки" req>
              <Input
                type="date"
                value={f.lead_date ?? ""}
                onChange={(e) => set({ lead_date: e.target.value })}
              />
            </Field>
            <Field label="Источник" req>
              <select
                className={sel}
                value={f.source ?? ""}
                onChange={(e) => set({ source: e.target.value })}
              >
                <option value="">—</option>
                {sources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Линия" req>
              <select
                className={sel}
                value={f.line ?? ""}
                onChange={(e) => set({ line: e.target.value })}
              >
                <option value="">—</option>
                {LINES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Канал">
              <select
                className={sel}
                value={f.channel ?? ""}
                onChange={(e) => set({ channel: e.target.value })}
              >
                <option value="">—</option>
                {CHANNELS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Филиал" req>
              <select
                className={sel}
                value={f.branch_code}
                onChange={(e) =>
                  set({
                    branch_code: e.target.value,
                    funnel: BRANCH_FUNNELS[e.target.value]?.[0] ?? "nova_general",
                    doctor_id: null,
                  })
                }
              >
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Воронка" req>
              <select
                className={sel}
                value={f.funnel}
                onChange={(e) => set({ funnel: e.target.value, stage: 1 })}
              >
                {(BRANCH_FUNNELS[f.branch_code] ?? []).map((c) => (
                  <option key={c} value={c}>
                    {FUNNELS[c].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Этап">
              <select
                className={sel}
                value={f.stage}
                onChange={(e) => {
                  const st = Number(e.target.value);
                  set({
                    stage: st,
                    ...(f.funnel === "nova_check" && st >= 3 && !f.prepayment
                      ? { prepayment: NOVA_CHECK_PREPAYMENT }
                      : {}),
                  });
                }}
              >
                {stages.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.n === FINAL ? "✓ " : s.n === REANIMATION ? "" : s.n + ". "}
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-full grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4">
              {(
                [
                  ["Привёл", f.brought_by_email],
                  ["Записал", f.booked_by_email],
                  ["Подтвердил", f.confirmed_by_email],
                  ["Довёл до операции", f.operation_by_email],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <div className="text-muted-foreground">{l}</div>
                  <div className="truncate font-medium">{v || "—"}</div>
                </div>
              ))}
            </div>
            <Field label="Ответственный (email)">
              <Input
                value={f.responsible_email ?? ""}
                onChange={(e) => set({ responsible_email: e.target.value })}
              />
            </Field>
            <Field label="Следующее касание">
              <Input
                type="date"
                value={f.next_touch ?? ""}
                onChange={(e) => set({ next_touch: e.target.value || null })}
              />
            </Field>
            <Field label="Страховая">
              <select
                className={sel}
                value={f.insurance ?? ""}
                onChange={(e) => set({ insurance: e.target.value || null })}
              >
                <option value="">Нет</option>
                {insurances.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Партнёр (агентская программа)">
              <select
                className={sel}
                value={f.partner_id ?? ""}
                onChange={(e) => set({ partner_id: e.target.value || null })}
              >
                <option value="">Нет</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!f.foreigner} onCheckedChange={(v) => set({ foreigner: !!v })} />
              Иностранный пациент (+10%)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!f.interest} onCheckedChange={(v) => set({ interest: !!v })} />
              Есть интерес
            </label>
            <div className="sm:col-span-2">
              <Field label="Комментарий">
                <Textarea
                  rows={2}
                  value={f.comment ?? ""}
                  onChange={(e) => set({ comment: e.target.value })}
                />
              </Field>
            </div>
          </Block>

          <Block title="Запись и явка">
            <Field label={funnelDef?.surgery ? "Хирург" : "Врач"}>
              <select
                className={sel}
                value={f.doctor_id ?? ""}
                onChange={(e) => set({ doctor_id: e.target.value || null })}
              >
                <option value="">—</option>
                {branchDoctors.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.status === "Декрет"}>
                    {d.full_name} — {d.specialty}
                    {d.status === "Декрет" ? " (декрет)" : ""}
                  </option>
                ))}
              </select>
              {doctor && <p className="text-xs text-muted-foreground">Приём: {doctor.schedule}</p>}
            </Field>
            <Field label="Дата и время визита">
              <Input
                type="datetime-local"
                value={f.visit_date ? f.visit_date.slice(0, 16) : ""}
                onChange={(e) =>
                  set({ visit_date: e.target.value ? e.target.value + ":00+06:00" : null })
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!f.confirmed} onCheckedChange={(v) => set({ confirmed: !!v })} />
              Подтверждено
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!f.came}
                onCheckedChange={(v) => set({ came: !!v, visited_at: v ? bishkekDate() : null })}
              />
              Пришёл
            </label>
          </Block>

          {f.funnel === "nova_check" ? (
            <Block title="Nova Check">
              <Field label="Предоплата, сом">
                <Input
                  type="number"
                  value={f.prepayment ?? ""}
                  onChange={(e) =>
                    set({ prepayment: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Дата предоплаты">
                <Input
                  type="date"
                  value={f.prepayment_date ?? ""}
                  onChange={(e) => set({ prepayment_date: e.target.value || null })}
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Предоплата {fmtMoney(NOVA_CHECK_PREPAYMENT)} (Элсом / Мбанк). Обследование 3 дня,
                затем паспорт здоровья; повторный чекап — через год. Не больше{" "}
                {NOVA_CHECK_DAILY_LIMIT} чекапов в день.
              </p>
            </Block>
          ) : funnelDef?.surgery ? (
            <Block title="Операция и оплата">
              <Field label="Дата операции">
                <Input
                  type="date"
                  value={f.operation_date ?? ""}
                  onChange={(e) => set({ operation_date: e.target.value || null })}
                />
              </Field>
              <Field label="Стоимость, сом">
                <Input
                  type="number"
                  value={f.operation_cost ?? ""}
                  onChange={(e) =>
                    set({ operation_cost: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Предоплата, сом">
                <Input
                  type="number"
                  value={f.prepayment ?? ""}
                  onChange={(e) =>
                    set({ prepayment: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Дата предоплаты">
                <Input
                  type="date"
                  value={f.prepayment_date ?? ""}
                  onChange={(e) => set({ prepayment_date: e.target.value || null })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={!!f.installment}
                  onCheckedChange={(v) => set({ installment: !!v })}
                />
                Рассрочка (О!Банк)
              </label>
              {f.installment && (
                <p className="rounded-lg bg-secondary p-2.5 text-xs text-secondary-foreground sm:col-span-2">
                  «Рассрочка О!Банк на 3, 6 или 9 месяцев, до 250 000 сом. Скидки и акции при
                  рассрочке не действуют. Нужны паспорт и справка с работы за 3–6 месяцев
                  {totals.kgs > INSTALLMENT_GUARANTOR_FROM ? ", а также поручитель" : ""}.
                  Оформление на ресепшене Абдумомунова, 2 и 3 этаж.»
                </p>
              )}
            </Block>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-primary">Услуги и смета</h3>
            <div className="relative">
              <Input
                placeholder="Найти услугу в прайсе филиала…"
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
              />
              {svcResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {svcResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addItem(s)}
                      className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        {s.name}
                        <span className="block text-xs text-muted-foreground">
                          {s.direction}
                          {s.note ? ` · ${s.note}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">
                        {s.price_from ? "от " : ""}
                        {s.price_text || fmtMoney(Number(s.price ?? 0), s.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 divide-y">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="flex-1">
                    {i.name}
                    {i.is_package && (
                      <Badge variant="outline" className="ml-2">
                        пакет
                      </Badge>
                    )}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-14"
                    value={i.qty}
                    onChange={(e) => updItem(i.id, { qty: Math.max(1, Number(e.target.value)) })}
                    aria-label="Количество"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="h-8 w-16"
                    value={i.discount}
                    disabled={i.is_package}
                    onChange={(e) => updItem(i.id, { discount: Number(e.target.value) })}
                    aria-label="Скидка %"
                    title="Скидка %"
                  />
                  <div className="w-28 text-right">
                    {i.price_from ? "от " : ""}
                    {fmtMoney(i.price * i.qty, i.currency)}
                  </div>
                  <button
                    onClick={() => delItem(i.id)}
                    aria-label="Удалить"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {!items.length && (
                <p className="py-2 text-sm text-muted-foreground">Услуги не добавлены</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="font-semibold">Итого: {totalsText(totals)}</div>
              {funnelDef?.surgery && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set({ operation_cost: totals.kgs })}
                >
                  Записать в стоимость операции
                </Button>
              )}
            </div>
          </section>

          {leadId && (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-4 rounded-lg bg-secondary p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
                    <Sparkles className="size-4" />
                    Следующий шаг от AI
                  </span>
                  <Button size="sm" onClick={askAi} disabled={ai.loading}>
                    {ai.loading ? "Думаю…" : ai.text ? "Обновить" : "Подсказать"}
                  </Button>
                </div>
                {ai.text && <p className="mt-2 whitespace-pre-wrap text-sm">{ai.text}</p>}
                {ai.error && <p className="mt-2 text-sm text-destructive">{ai.error}</p>}
                {!ai.text && !ai.error && !ai.loading && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Учитывает этап, смету, заметки и историю касаний. Сохраните изменения перед
                    запросом.
                  </p>
                )}
              </div>
              <h3 className="mb-3 text-sm font-semibold text-primary">Действия</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  className={sel + " w-56"}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Причина…</option>
                  {reasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                {OUTCOMES.map((o) => (
                  <Button key={o} size="sm" variant="outline" onClick={() => closeAs(o)}>
                    {o === "Потерянный" ? "Потерян" : o}
                  </Button>
                ))}
                {f.outcome && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => save({ outcome: null, outcome_reason: null })}
                  >
                    Вернуть в воронку
                  </Button>
                )}
                {(f.branch_code === "moskovskaya" || f.branch_code === "abd2") && (
                  <Button size="sm" variant="secondary" onClick={toSurgeon}>
                    Направить к хирургу
                  </Button>
                )}
              </div>
            </section>
          )}

          {leadId && (
            <section className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-primary">Заметки и касания</h3>
              <div className="mb-3 flex gap-2">
                <Textarea
                  rows={2}
                  placeholder="Заметка: что важно пациенту, возражения, договорённости…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={addNote} disabled={!note.trim()}>
                  Сохранить заметку
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className={sel + " w-32"}
                  value={touch.channel}
                  onChange={(e) => setTouch({ ...touch, channel: e.target.value })}
                >
                  {CHANNELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <Input
                  className="min-w-40 flex-1"
                  placeholder="Результат"
                  value={touch.result}
                  onChange={(e) => setTouch({ ...touch, result: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={touch.no_answer}
                    onCheckedChange={(v) => setTouch({ ...touch, no_answer: !!v })}
                  />
                  Не ответил
                </label>
                <Button size="sm" onClick={addTouch}>
                  Добавить
                </Button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {(touchesQ.data ?? []).map((t) => (
                  <li key={t.id} className="text-muted-foreground">
                    <span className="text-foreground">{fmtDate(t.touched_at)}</span> · {t.channel} ·{" "}
                    {t.no_answer ? "не ответил" : t.result} · {t.author_email}
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-primary">История</h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(histQ.data ?? []).map((h) => (
                  <li key={h.id}>
                    {fmtDate(h.changed_at)} · {h.author_email} ·{" "}
                    {Object.keys(h.changes as object).join(", ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="fixed bottom-0 right-0 flex w-full justify-end gap-2 border-t bg-card p-3 sm:max-w-2xl">
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          <Button onClick={() => save()}>{leadId ? "Сохранить" : "Создать заявку"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
