import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { loginOptionsSchema, sessionInfoSchema, wachplanStatusSchema, type LoginOptions } from "@els/domain";
import { Ledger, errorMessage } from "../core/ledger";
import type { Bootstrap, Runtime } from "../core/runtime";
import { SessionExpired, api, createSync, serverNow } from "../core/sync";

const DB_NAME = "els";

/**
 * Live-Betrieb: Sync mit dem Server, Zugang mit Passcode oder Wachplan-Konto.
 * Wer einmal angemeldet war, arbeitet offline weiter. Läuft die Sitzung ab,
 * fragt die App beim nächsten Kontakt zum Server erneut nach dem Passcode;
 * die Outbox bleibt dabei erhalten.
 */
export const bootstrap: Bootstrap = async () => {
  const ledger = await Ledger.open(DB_NAME, serverNow);
  const sync = createSync(ledger);
  let sessionExpiresAt = await ledger.getMeta<string>("sessionExpiresAt");
  let wachplanLink = await ledger.getMeta<string>("wachplanLink");
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
    wachplanLink: () => wachplanLink,
    wachplan: {
      status: async () => wachplanStatusSchema.parse(await api("/api/wachplan")),
      async sync() {
        const status = wachplanStatusSchema.parse(await api("/api/wachplan/sync", {}));
        sync.kick();
        return status;
      },
    },
    async logout() {
      await api("/api/logout", {}).catch(() => undefined);
      await ledger.setMeta("sessionExpiresAt", undefined);
      await ledger.setMeta("wachplanLink", undefined);
      sessionExpiresAt = wachplanLink = undefined;
      sync.requireLogin();
    },
  };

  /** Der Link zum Wachplan erscheint nur, wer mit Wachplan-Konto kam; Tablets bleiben im ELS. */
  async function startSession(path: string, body: unknown, link: string | undefined) {
    const info = sessionInfoSchema.parse(await api(path, body));
    await ledger.setMeta("sessionExpiresAt", info.expiresAt);
    await ledger.setMeta("wachplanLink", link);
    sessionExpiresAt = info.expiresAt;
    wachplanLink = link;
    sync.resume();
  }
  const login = (passcode: string) => startSession("/api/login", { passcode }, undefined);
  const loginWachplan = (url: string) => startSession("/api/login/wachplan", {}, url);

  function Gate({ children }: { children: ReactNode }) {
    const status = useSyncExternalStore(sync.subscribe, sync.status);
    if (status.kind !== "login") return children;
    return <Login onLogin={login} onWachplan={loginWachplan} />;
  }

  if (hadSession) sync.kick();
  return { runtime, Gate };
};

function Login({
  onLogin,
  onWachplan,
}: {
  onLogin: (passcode: string) => Promise<void>;
  onWachplan: (url: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wachplan, setWachplan] = useState<LoginOptions["wachplan"]>(null);

  useEffect(() => {
    api("/api/login/options").then(
      (o) => setWachplan(loginOptionsSchema.parse(o).wachplan),
      () => undefined,
    );
  }, []);

  async function viaWachplan(url: string) {
    setBusy(true);
    try {
      await onWachplan(url);
    } catch (e) {
      setError(
        e instanceof SessionExpired
          ? "Nicht im Wachplan angemeldet. Erst dort anmelden, dann hier erneut tippen."
          : e instanceof TypeError || !navigator.onLine
            ? "Keine Verbindung zum Server. Anmeldung ist nur mit Netz möglich."
            : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }

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
        {wachplan?.login && (
          <>
            <button type="button" className="btn big" disabled={busy} onClick={() => void viaWachplan(wachplan.url)}>
              Mit Wachplan-Konto anmelden
            </button>
            <p className="hint">
              Für Planer: erst im <a href={wachplan.url}>Wachplan</a> anmelden, dann hier tippen. Zugang hat, wer den
              angebundenen Plan öffnen darf.
            </p>
          </>
        )}
        <p className="hint">Lokal gespeicherte Eingaben bleiben erhalten und werden nach der Anmeldung gesendet.</p>
      </form>
    </main>
  );
}
