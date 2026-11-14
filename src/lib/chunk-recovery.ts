const KEY = "nova-chunk-recovery";
const RETRY_WINDOW = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .+ failed/i.test(message);
}

// One document refresh obtains the current asset manifest; retries of the same
// rejected import retain the old URL and cannot repair an obsolete chunk.
export function recoverChunkLoad(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
  try {
    const previous = Number(window.sessionStorage.getItem(KEY));
    const now = Date.now();
    if (previous && now - previous < RETRY_WINDOW) return false;
    window.sessionStorage.setItem(KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    // Storage may be disabled. Do not reload without a reliable loop guard.
    return false;
  }
}

export function installChunkRecovery() {
  const preload = (event: Event) => {
    const error = (event as Event & { payload?: unknown }).payload;
    if (recoverChunkLoad(error)) event.preventDefault();
  };
  const rejected = (event: PromiseRejectionEvent) => {
    if (recoverChunkLoad(event.reason)) event.preventDefault();
  };
  window.addEventListener("vite:preloadError", preload);
  window.addEventListener("unhandledrejection", rejected);
  return () => {
    window.removeEventListener("vite:preloadError", preload);
    window.removeEventListener("unhandledrejection", rejected);
  };
}