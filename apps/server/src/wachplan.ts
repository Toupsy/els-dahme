import { randomUUID } from "node:crypto";
import {
  canonicalJson,
  formatDate,
  rosterFromDuty,
  shiftDate,
  toIso,
  wachplanDutySchema,
  watchDate,
  type WachplanDuty,
  type WachplanStatus,
} from "@els/domain";
import type { Ledger } from "./ledger";

/** Geräte-ID des Servers für Aktionen aus dem Wachplan-Abruf. */
export const WACHPLAN_DEVICE_ID = "edac72a8-2ed3-4240-a0c4-d2511c7cee48";

export const WACHPLAN_OFF: WachplanStatus = {
  configured: false,
  plan: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null,
  warnings: [],
  days: [],
};

export type WachplanOptions = { url: string; key: string; days: number; intervalMs: number };
type Deps = { now: () => number; fetch: typeof fetch; log: (message: string) => void };

/**
 * Holt die Besetzung von heute bis `days - 1` Tage voraus beim Wachplan ab.
 * Weicht ein Tag vom Stand im ELS ab, legt der Server `roster.setDay` an; die
 * Geräte bekommen ihn über den normalen Abgleich. Frühere Tage bleiben, wie sie
 * waren, und ein Tag, den der Wachplan (noch) nicht liefert, bleibt unverändert.
 */
export function createWachplanLink(options: WachplanOptions, ledger: Ledger, deps: Deps) {
  let status: WachplanStatus = { ...WACHPLAN_OFF, configured: true };
  let running: Promise<WachplanStatus> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function fetchDuty(from: string, to: string): Promise<WachplanDuty> {
    const url = `${options.url.replace(/\/+$/, "")}/api/els/duty?from=${from}&to=${to}`;
    let response: Response;
    try {
      response = await deps.fetch(url, {
        headers: { Authorization: `Bearer ${options.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "TimeoutError"
          ? "Wachplan antwortet nicht."
          : "Wachplan nicht erreichbar.",
        { cause: error },
      );
    }
    if (response.status === 401) throw new Error("Der Wachplan nimmt den Schlüssel nicht an.");
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = (body as { error?: unknown } | null)?.error;
      throw new Error(
        typeof message === "string" ? `Wachplan: ${message}` : `Wachplan antwortet mit ${response.status}.`,
      );
    }
    const duty = wachplanDutySchema.safeParse(body);
    if (!duty.success) throw new Error("Antwort des Wachplans nicht lesbar.");
    return duty.data;
  }

  async function run(): Promise<WachplanStatus> {
    const at = toIso(deps.now());
    const from = watchDate(deps.now());
    const to = shiftDate(from, options.days - 1);
    try {
      const duty = await fetchDuty(from, to);
      const warnings: string[] = [];
      const days: WachplanStatus["days"] = [];
      for (const day of duty.days) {
        if (day.date < from || day.date > to) continue;
        const { people, warnings: dayWarnings } = rosterFromDuty(day);
        warnings.push(...dayWarnings.map((w) => `${formatDate(day.date)}: ${w}`));
        days.push({ date: day.date, people: people.length });
        if (canonicalJson(ledger.state.roster[day.date] ?? null) === canonicalJson(people)) continue;
        ledger.apply({
          id: randomUUID(),
          deviceId: WACHPLAN_DEVICE_ID,
          createdAt: toIso(deps.now()),
          type: "roster.setDay",
          data: { date: day.date, people },
        });
      }
      status = { configured: true, plan: duty.plan, lastAttemptAt: at, lastSuccessAt: at, error: null, warnings, days };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== status.error) deps.log(`Wachplan-Abruf fehlgeschlagen: ${message}`);
      status = { ...status, lastAttemptAt: at, error: message };
    }
    return status;
  }

  return {
    status: () => status,
    /** Läuft schon ein Abruf, warten alle auf denselben. */
    syncNow(): Promise<WachplanStatus> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
    start() {
      void this.syncNow();
      timer = setInterval(() => void this.syncNow(), options.intervalMs);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
}

export type WachplanLink = ReturnType<typeof createWachplanLink>;
