export function chat2deskApi(tokenValue: string | undefined, override?: string) {
  const token = tokenValue?.replace(/^[\s"']+|[\s"']+$/g, "");
  if (!token) throw new Error("Добавьте CHAT2DESK_API_TOKEN в секреты проекта.");
  const hosts = [...new Set([override?.trim().replace(/\/+$/, ""), "https://api-rus02.chat2desk.com", "https://api.chat2desk.com"].filter((host): host is string => Boolean(host)))];
  const headers = { Authorization: token, "Content-Type": "application/json" };
  const describeError = async (host: string, response: Response) => {
    let detail = "";
    try {
      const body = await response.json() as { errors?: unknown };
      if (typeof body.errors === "string" && body.errors.length <= 200) detail = `: ${body.errors.split(token).join("[скрыто]").replace(/[\r\n]/g, " ")}`;
    } catch { /* Errors may not be JSON. */ }
    return `${host} — код ${response.status}${detail}`;
  };
  async function select(path: string, beforeCall = async () => {}, selectedHost?: string) {
    const failures: string[] = [];
    for (const host of selectedHost ? [selectedHost] : hosts) {
      await beforeCall();
      let response: Response;
      try { response = await fetch(`${host}${path}`, { headers, signal: AbortSignal.timeout(5000) }); }
      catch { failures.push(`${host} — нет ответа`); break; }
      if (response.ok) return { host, response };
      failures.push(await describeError(host, response));
      if (response.status !== 403) break;
    }
    throw new Error(`Не удалось подключить Chat2Desk: ${failures.join("; ")}. Проверьте, что в CHAT2DESK_API_TOKEN сохранён токен целиком из Chat2Desk → API и скрипты → API → Показать.`);
  }
  return { headers, describeError, select };
}