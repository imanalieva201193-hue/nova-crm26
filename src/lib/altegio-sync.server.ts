import { altegioApi, AltegioError } from "./altegio-api.server";
import type { AltegioRow } from "./altegio";

type Db = typeof import("@/integrations/supabase/client.server").supabaseAdmin;
const dbRow = (r: AltegioRow) => r as unknown as Record<string, unknown>;

export async function applyRows(db: Db, rows: AltegioRow[]) {
  if (!rows.length) return 0;
  const res = await db.rpc("apply_altegio_records", { _rows: rows.map(dbRow) as never });
  if (res.error) throw new Error("Не удалось сохранить записи Altegio.");
  return rows.length;
}

export async function mappedLocations(db: Db) {
  const res = await db.from("altegio_locations").select("location_id").not("branch_code", "is", null).order("location_id");
  if (res.error) throw new Error("Не удалось прочитать филиалы Altegio.");
  return res.data.map((l) => Number(l.location_id));
}

/** One resumable chunk: sequential pages per location; the cursor is committed after each page. */
export async function runJobChunk(db: Db, id: string, api = altegioApi()) {
  const claimed = await db.rpc("claim_altegio_job", { _id: id });
  if (claimed.error) throw new Error("Не удалось продолжить загрузку.");
  if (!claimed.data) return (await db.from("altegio_jobs").select("*").eq("id", id).single()).data;
  const job = claimed.data as unknown as { id: string; from_date: string; location_ids: number[]; loc_index: number; page: number; api_calls: number; imported: number };
  const deadline = Date.now() + 20000;
  const until = new Date(Date.now() + 366 * 864e5).toISOString().slice(0, 10);
  const save = (patch: Record<string, unknown>) => db.from("altegio_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  try {
    let pages = 0;
    while (job.loc_index < job.location_ids.length && Date.now() < deadline && pages < 15) {
      const loc = job.location_ids[job.loc_index];
      if (loc === undefined) throw new Error("Филиал задания не найден.");
      const rows = await api.records(loc, { page: String(job.page), start_date: job.from_date, end_date: until });
      pages += 1; job.api_calls += 1;
      job.imported += await applyRows(db, rows);
      if (rows.length < 100) { job.loc_index += 1; job.page = 1; } else job.page += 1;
      await save({ loc_index: job.loc_index, page: job.page, api_calls: job.api_calls, imported: job.imported });
    }
    const done = job.loc_index >= job.location_ids.length;
    await save({ status: done ? "done" : "running", lease_until: null });
  } catch (e) {
    await save({ status: "error", error: e instanceof AltegioError ? e.message : "Загрузка остановлена. Нажмите «Продолжить».", lease_until: null, api_calls: job.api_calls });
  }
  return (await db.from("altegio_jobs").select("*").eq("id", id).single()).data;
}

/** Hourly safety net: everything changed in the last 3 days per mapped location. */
export async function reconcile(db: Db, api = altegioApi()) {
  const since = new Date(Date.now() + 6 * 3600e3 - 3 * 864e5).toISOString().slice(0, 19);
  let total = 0;
  for (const loc of await mappedLocations(db)) {
    for (let page = 1; page <= 20; page++) {
      const rows = await api.records(loc, { page: String(page), changed_after: since });
      total += await applyRows(db, rows);
      if (rows.length < 100) break;
    }
  }
  return total;
}
