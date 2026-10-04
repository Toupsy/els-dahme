import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { sessionInfoSchema } from "@els/domain";
import { Ledger, errorMessage } from "../core/ledger";
import type { Bootstrap, Runtime } from "../core/runtime";
import { SessionExpired, api, createSync, serverNow } from "../core/sync";

const DB_NAME = "els";

/**
 * Live-Betrieb: Sync mit dem Server, Zugang nur mit Passcode.
 * Wer einmal angemeldet war, arbeitet offline weiter. Läuft die Sitzung ab,
 * fragt die App beim nächsten Kontakt zum Server erneut nach dem Passcode;
 * die Outbox bleibt dabei erhalten.
 */
export const bootstrap: Bootstrap = async () => {
  const ledger = await Ledger.open(DB_NAME, serverNow);
  const sync = createSync(ledger);
  let sessionExpiresAt = await ledger.getMeta<string>("sessionExpiresAt");
  const hadSession = sessionExpiresAt !== undefined;
  if (!hadSession) sync.requireLogin();

  const runtime: Runtime = {
    mode: "live",
    ledger,
    now: serverNow,
    status: sync.status,
    subscribeStatus: sync.subscribe,
    kick: sync.kick,
    sessionExpiresAt: () => sessionExpiresAt,
    async logout() {
      await api("/api/logout", {}).catch(() => undefined);
      await ledger.setMeta("sessionExpiresAt", undefined);
      sessionExpiresAt = undefined;
      sync.requireLogin();
    },
  };

  async function login(passcode: string) {
    const info = sessionInfoSchema.parse(await api("/api/login", { passcode }));
    await ledger.setMeta("sessionExpiresAt", info.expiresAt);
    sessionExpiresAt = info.expiresAt;
    sync.resume();
  }

  function Gate({ children }: { children: ReactNode }) {
    const status = useSyncExternalStore(sync.subscribe, sync.status);
    if (status.kind !== "login") return children;
    return <Login onLogin={login} />;
  }

  if (hadSession) sync.kick();
  return { runtime, Gate };
};

function Login({ onLogin }: { onLogin: (passcode: string) => Promise<void> }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(passcode);
    } catch (e) {
      setError(
        e instanceof SessionExpired
          ? "Passcode falsch."
          : e instanceof TypeError || !navigator.onLine
            ? "Keine Verbindung zum Server. Anmeldung ist nur mit Netz möglich."
            : errorMessage(e),
      );
    } finally {
      setBusy(false);
      setPasscode("");
    }
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={submit}>
        <h1>ELS Dahme</h1>
        <label htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
        <button className="btn primary big" disabled={busy || !passcode}>
          Anmelden
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint">Lokal gespeicherte Eingaben bleiben erhalten und werden nach der Anmeldung gesendet.</p>
      </form>
    </main>
  );
}
