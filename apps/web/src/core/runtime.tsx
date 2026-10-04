import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Intent, IntentInput, IntentType } from "@els/domain";
import { errorMessage, type Ledger, type LedgerSnapshot } from "./ledger";

export type SyncStatus =
  | { kind: "demo" }
  | { kind: "synced"; at: number }
  | { kind: "syncing" }
  | { kind: "pending" }
  | { kind: "offline" }
  | { kind: "login" }
  | { kind: "error"; message: string };

/** Was die Oberfläche von der Betriebsart sieht. Demo und Live liefern dieselbe Form. */
export interface Runtime {
  mode: "demo" | "live";
  ledger: Ledger;
  now(): number;
  status(): SyncStatus;
  subscribeStatus(listener: () => void): () => void;
  /** Nach jeder neuen Aktion: Demo bestätigt lokal, Live sendet an den Server. */
  kick(): void;
  logout?(): Promise<void>;
  resetDemo?(): Promise<void>;
}

/** Einstieg je Betriebsart (src/mode/live.tsx bzw. src/mode/demo.tsx). */
export type Bootstrap = () => Promise<{ runtime: Runtime; Gate: (props: { children: ReactNode }) => ReactNode }>;

const RuntimeContext = createContext<Runtime | null>(null);
export const RuntimeProvider = RuntimeContext.Provider;

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("Runtime fehlt");
  return runtime;
}

export function useLedger(): LedgerSnapshot {
  const { ledger } = useRuntime();
  return useSyncExternalStore(ledger.subscribe, ledger.getSnapshot);
}

export function useSyncStatus(): SyncStatus {
  const runtime = useRuntime();
  return useSyncExternalStore(runtime.subscribeStatus, runtime.status);
}

/** Aktuelle Zeit, die regelmäßig weiterläuft (für laufende Fahrten und Einsätze). */
export function useNow(intervalMs = 15_000): number {
  const runtime = useRuntime();
  const [now, setNow] = useState(() => runtime.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(runtime.now()), intervalMs);
    return () => clearInterval(timer);
  }, [runtime, intervalMs]);
  return now;
}

/** Liefert die angenommene Aktion oder null bei einem Fachfehler. */
export type Dispatch = <T extends IntentType>(input: IntentInput<T>) => Promise<Intent | null>;

/** Löst eine Aktion aus. Fachfehler erscheinen als Hinweis, nichts wird gespeichert. */
export function useDispatch(): { dispatch: Dispatch; error: string | null; clearError: () => void } {
  const runtime = useRuntime();
  const [error, setError] = useState<string | null>(null);
  const dispatch: Dispatch = async (input) => {
    try {
      const intent = await runtime.ledger.dispatch(input);
      setError(null);
      runtime.kick();
      return intent;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  };
  return { dispatch, error, clearError: () => setError(null) };
}
