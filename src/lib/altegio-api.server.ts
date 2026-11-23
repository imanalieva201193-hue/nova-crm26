// Server-only Altegio client. Tokens come from Secrets and never leave the server.
import { normalizeRecord, type AltegioRow } from "./altegio";

const BASE = "https://api.alteg.io/api/v1";
const clean = (v?: string) => v?.replace(/^[\s"']+|[\s"']+$/g, "") || undefined;
type Env = Record<string, string | undefined>;

export class AltegioError extends Error {}

export function altegioApi(env: Env = process.env, fetcher: typeof fetch = fetch) {
  const partner = clean(env["ALTEGIO_PARTNER_TOKEN"]);
  let user = clean(env["ALTEGIO_USER_TOKEN"]);
  const secrets = [partner, user, clean(env["ALTEGIO_PASSWORD"])].filter((s): s is string => !!s);
  const redact = (s: string) => secrets.reduce((acc, t) => acc.split(t).join("[скрыто]"), s).replace(/[\r\n]/g, " ").slice(0, 200);
  let calls = 0;
  async function call(path: string, init: RequestInit = {}, auth = true): Promise<unknown> {
    if (!partner) throw new AltegioError("Добавьте ALTEGIO_PARTNER_TOKEN в секреты проекта.");
    if (auth && !user) await login();
    calls += 1;
    let res: Response;
    try {
      res = await fetcher(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(10000), headers: {
        Accept: "application/vnd.api.v2+json", "Content-Type": "application/json",
        Authorization: auth ? `Bearer ${partner}, User ${user}` : `Bearer ${partner}`,
      } });
    } catch { throw new AltegioError("Altegio не ответил. Попробуйте позже."); }
    let body: { success?: boolean; data?: unknown; meta?: { message?: unknown } } = {};
    try { body = await res.json() as typeof body; } catch { /* non-JSON */ }
    if (!res.ok || body.success === false) {
      const msg = typeof body.meta?.message === "string" ? `: ${redact(body.meta.message)}` : "";
      const err = new AltegioError(`Altegio — код ${res.status}${msg}`);
      (err as AltegioError & { status?: number }).status = res.status;
      throw err;
    }
    return body.data;
  }
  async function login() {
    const loginName = clean(env["ALTEGIO_LOGIN"]), password = clean(env["ALTEGIO_PASSWORD"]);
    if (!loginName || !password) throw new AltegioError("Добавьте ALTEGIO_USER_TOKEN или ALTEGIO_LOGIN и ALTEGIO_PASSWORD в секреты проекта.");
    const data = await call("/auth", { method: "POST", body: JSON.stringify({ login: loginName, password }) }, false) as { user_token?: string };
    if (!data?.user_token) throw new AltegioError("Altegio не выдал ключ пользователя.");
    user = data.user_token; secrets.push(user);
  }
  const list = (d: unknown) => (Array.isArray(d) ? d as Record<string, unknown>[] : []);
  return {
    get calls() { return calls; },
    locations: async () => list(await call("/companies?my=1")).map((c) => ({ id: Number(c["id"]), title: String(c["title"] ?? c["public_title"] ?? "") })),
    records: async (loc: number, params: Record<string, string>) => {
      const q = new URLSearchParams({ count: "100", with_deleted: "1", ...params });
      return list(await call(`/records/${loc}?${q}`)).map((r) => normalizeRecord(r, loc)).filter((r): r is AltegioRow => !!r);
    },
    record: async (loc: number, id: number) => {
      try { const d = await call(`/record/${loc}/${id}`); return normalizeRecord((d ?? {}) as Record<string, unknown>, loc); }
      catch (e) { if ((e as { status?: number }).status === 404) return "missing" as const; throw e; }
    },
    services: async (loc: number) => list(await call(`/company/${loc}/services`)).map((s) => ({ service_id: Number(s["id"]), title: String(s["title"] ?? ""), category_id: Number(s["category_id"]) || null })),
    categories: async (loc: number) => list(await call(`/service_categories/${loc}`)).map((c) => ({ category_id: Number(c["id"]), title: String(c["title"] ?? "") })),
    users: async (loc: number) => list(await call(`/company/${loc}/users`)).map((u) => ({ user_id: Number(u["id"]), name: String(u["name"] ?? "") })),
    registerHook: (loc: number, url: string) => call(`/hooks_settings/${loc}`, { method: "POST", body: JSON.stringify({ urls: [url], active: 1, record: 1, client: 1 }) }),
  };
}
