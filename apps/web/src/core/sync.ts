import { PUSH_LIMIT, pullResponseSchema, pushResultSchema, type Intent } from "@els/domain";
import type { Ledger } from "./ledger";
import type { SyncStatus } from "./runtime";

export class SessionExpired extends Error {}

/** Höchstens 100 Aktionen und etwa 1 MB je Push (ein Wachplan-Tag kann groß sein). */
const PUSH_BYTES = 1_000_000;
export function nextBatch(pending: readonly Intent[]): Intent[] {
  const batch: Intent[] = [];
  let bytes = 0;
  for (const intent of pending.slice(0, PUSH_LIMIT)) {
    const size = JSON.stringify(intent).length;
    if (batch.length && bytes + size > PUSH_BYTES) break;
    batch.push(intent);
    bytes += size;
  }
  return batch;
}
class Conflict extends Error {}

/** Abweichung der Geräteuhr gegenüber dem Server (HTTP-Date), damit Funkzeiten stimmen. */
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

export async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const date = Date.parse(response.headers.get("Date") ?? "");
  if (Number.isFinite(date) && Math.abs(date - Date.now()) > 5_000) clockOffset = date - Date.now();
  else if (Number.isFinite(date)) clockOffset = 0;
  if (response.status === 401) throw new SessionExpired();
  if (response.status === 409) throw new Conflict();
  const json = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(json.message ?? `Serverfehler ${response.status}`);
  return json;
}

/**
 * Senden und Abholen laufen nacheinander. Fehler lassen die Outbox unberührt;
 * der nächste Versuch kommt nach Netzwechsel, Tastendruck oder Intervall.
 */
export function createSync(ledger: Ledger) {
  let status: SyncStatus = navigator.onLine ? { kind: "pending" } : { kind: "offline" };
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: SyncStatus) => {
    status = next;
    for (const l of listeners) l();
  };

  async function push() {
    let batch = nextBatch(ledger.pendingIntents);
    while (batch.length) {
      const result = pushResultSchema.parse(await api("/api/sync/push", { intents: batch }));
      await ledger.reject(
        result.failed
          .filter((f) => f.code !== "SERVER_ERROR")
          .map((f) => ({ id: f.id ?? batch[f.index]!.id, message: f.message })),
      );
      if (result.failed.some((f) => f.code === "SERVER_ERROR")) throw new Error("Server konnte nicht alles speichern.");
      await pull();
      const next = nextBatch(ledger.pendingIntents);
      if (next.length && next[0]!.id === batch[0]!.id) break;
      batch = next;
    }
  }

  async function pull() {
    for (;;) {
      let page;
      try {
        page = pullResponseSchema.parse(await api(`/api/sync/pull?since=${ledger.cursor}&limit=500`));
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
        await ledger.resetConfirmed();
        continue;
      }
      if (page.intents.length) await ledger.acceptBatch(page.intents, page.cursor);
      if (!page.hasMore) return;
    }
  }

  async function cycle() {
    if (!navigator.onLine) return set({ kind: "offline" });
    set({ kind: "syncing" });
    try {
      await pull();
      await push();
      set(ledger.pendingIntents.length ? { kind: "pending" } : { kind: "synced", at: Date.now() });
    } catch (error) {
      if (error instanceof SessionExpired) return set({ kind: "login" });
      set(
        navigator.onLine && !(error instanceof TypeError)
          ? { kind: "error", message: (error as Error).message }
          : { kind: "offline" },
      );
    }
  }

  function run() {
    if (status.kind === "login") return;
    if (running) {
      again = true;
      return;
    }
    running = cycle().finally(() => {
      running = null;
      if (again) {
        again = false;
        run();
      }
    });
  }

  function kick() {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  }

  window.addEventListener("online", kick);
  window.addEventListener("offline", () => set({ kind: "offline" }));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && kick());
  setInterval(run, 15_000);

  return {
    status: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    kick,
    /** Nach erneuter Anmeldung weiterarbeiten. */
    resume() {
      set({ kind: "pending" });
      run();
    },
    requireLogin() {
      set({ kind: "login" });
    },
  };
}
