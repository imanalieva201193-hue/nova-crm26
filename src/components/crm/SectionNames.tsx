import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_LABELS, useLabels } from "./labels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SectionNames() {
  const labels = useLabels();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    const rows = Object.entries(draft).map(([key, title]) => ({ key, title: title.trim() }));
    if (rows.some((r) => !r.title || r.title.length > 100)) {
      toast.error("Введите название от 1 до 100 символов");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("crm_labels").upsert(rows);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["crm-labels"] });
    setDraft({});
    toast.success("Названия сохранены");
  }
  return (
    <section className="space-y-4 border-b pb-6">
      <h2 className="font-display text-xl font-bold">Названия разделов</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {Object.entries(DEFAULT_LABELS).map(([key, title]) => (
          <label key={key} className="space-y-1 text-sm">
            <span>{title}</span>
            <Input
              aria-label={`Название: ${title}`}
              maxLength={100}
              value={draft[key] ?? labels[key] ?? title}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <Button disabled={busy || !Object.keys(draft).length} onClick={save}>
        {busy ? "Сохраняю…" : "Сохранить названия"}
      </Button>
    </section>
  );
}
