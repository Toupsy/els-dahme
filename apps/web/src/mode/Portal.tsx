import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { portalAccountSchema } from "@els/domain";
import { errorMessage } from "../core/ledger";
import { api, SessionExpired } from "../core/sync";

export async function portalAccount(planUrl: string): Promise<string | null> {
  try {
    return portalAccountSchema.parse(await api(`${planUrl}api/auth/me`)).user.username;
  } catch (error) {
    if (error instanceof SessionExpired) return null;
    throw error;
  }
}

export function SuiteHeader({
  active,
  planUrl,
  username,
  onLogout,
}: {
  active: "portal" | "els";
  planUrl: string;
  username?: string | null;
  onLogout?: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await onLogout?.();
      window.location.assign("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="suite-header">
      <div className="suite-header-inner">
        <a className="suite-brand" href="/">
          <strong>DLRG</strong>
          <span>Einsatz &amp; Planung</span>
        </a>
        <nav aria-label="Werkzeuge">
          <a href="/" aria-current={active === "portal" ? "page" : undefined}>
            Startseite
          </a>
          <a href={planUrl}>Wachplan</a>
          <a href="/els/" aria-current={active === "els" ? "page" : undefined}>
            ELS
          </a>
        </nav>
        {username && (
          <div className="suite-account">
            <span>{username}</span>
            <button className="btn" disabled={busy} onClick={() => void logout()}>
              {busy ? "Abmelden …" : "Abmelden"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="suite-error" role="alert">
          {error}{" "}
          <button className="btn" disabled={busy} onClick={() => void logout()}>
            Erneut versuchen
          </button>
        </p>
      )}
    </header>
  );
}

export function Portal({ planUrl, onLogout }: { planUrl: string; onLogout: () => Promise<void> }) {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    portalAccount(planUrl)
      .then(
        (u) => {
          if (alive) setUsername(u);
        },
        (e) => {
          if (alive) setError(errorMessage(e));
        },
      )
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [planUrl]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await api(`${planUrl}api/auth/login`, {
        username: data.get("username"),
        password: data.get("password"),
        remember: data.get("remember") === "on",
      });
      setUsername(await portalAccount(planUrl));
      form.reset();
    } catch (e) {
      setError(e instanceof SessionExpired ? "Benutzername oder Passwort falsch." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="portal-shell">
      <SuiteHeader active="portal" planUrl={planUrl} username={username} onLogout={onLogout} />
      <main className="portal-main">
        {checking ? (
          <p role="status">Anmeldung wird geprüft …</p>
        ) : username ? (
          <>
            <h1>Werkzeug auswählen</h1>
            <p className="hint">Angemeldet als {username}.</p>
            <div className="portal-tools">
              <section>
                <h2>Wachplan</h2>
                <p>Dienste planen und die Besetzung abstimmen.</p>
                <a className="btn primary" href={planUrl}>
                  Wachplan öffnen
                </a>
              </section>
              <section>
                <h2>ELS</h2>
                <p>Einsatzlage, Funk und Bootstagebuch führen.</p>
                <a className="btn primary" href="/els/">
                  ELS öffnen
                </a>
              </section>
            </div>
          </>
        ) : (
          <form className="portal-login" onSubmit={(e) => void submit(e)}>
            <h1>Anmelden</h1>
            <p className="hint">Mit dem bestehenden Wachplan-Konto anmelden.</p>
            <label htmlFor="username">Benutzername</label>
            <input id="username" name="username" autoComplete="username" required maxLength={200} />
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1000}
            />
            <label className="portal-remember">
              <input type="checkbox" name="remember" /> Angemeldet bleiben
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? "Anmelden …" : "Anmelden"}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <details>
              <summary>Tablet-Zugang</summary>
              <p>Der bisherige Passcode öffnet nur das ELS.</p>
              <a href="/els/?zugang=tablet">ELS mit Passcode öffnen</a>
            </details>
          </form>
        )}
      </main>
    </div>
  );
}

/** Kein zweiter Anmeldeknopf: direkte ELS-Einstiege verwenden das vorhandene Konto. */
export function AccountEntry({ onEnter, children }: { onEnter: () => Promise<void>; children?: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    onEnter().catch((e) => {
      if (alive) setError(e instanceof SessionExpired ? "Bitte zuerst auf der Startseite anmelden." : errorMessage(e));
    });
    return () => {
      alive = false;
    };
  }, [onEnter, attempt]);
  return (
    <main className="portal-main">
      <section className="portal-login">
        <h1>ELS</h1>
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <a href="/">Zur Anmeldung</a>
            <button
              className="btn"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Erneut versuchen
            </button>
          </>
        ) : (
          <p role="status">ELS-Zugang wird geprüft …</p>
        )}
        {children}
      </section>
    </main>
  );
}
