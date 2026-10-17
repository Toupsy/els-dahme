import { useEffect, useState } from "react";
import { formatClock, formatDate, watchDate, type WachplanStatus } from "@els/domain";
import { errorMessage } from "../../core/ledger";
import { useRuntime } from "../../core/runtime";

/** Stand der direkten Wachplan-Anbindung. Nur Live; ohne Netz bleibt der letzte bekannte Stand stehen. */
export function useWachplan() {
  const runtime = useRuntime();
  const [status, setStatus] = useState<WachplanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const link = runtime.wachplan;
    if (!link) return;
    let alive = true;
    const load = () =>
      link.status().then(
        (s) => alive && setStatus(s),
        () => undefined,
      );
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [runtime]);

  async function syncNow() {
    if (!runtime.wachplan) return;
    setBusy(true);
    try {
      setStatus(await runtime.wachplan.sync());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, error, syncNow };
}

export function WachplanBar({ link }: { link: ReturnType<typeof useWachplan> }) {
  const runtime = useRuntime();
  const { status, busy, error, syncNow } = link;
  if (!status?.configured) return null;
  const when = (at: string) =>
    watchDate(at) === watchDate(runtime.now()) ? formatClock(at) : `${formatDate(watchDate(at))} ${formatClock(at)}`;

  return (
    <section className="card stack-tight" data-testid="wachplan-link">
      <div className="row">
        {status.error ? (
          <span className="error">Wachplan nicht abgerufen: {status.error}</span>
        ) : (
          <span>Besetzung kommt direkt aus dem Wachplan{status.plan ? ` „${status.plan}“` : ""}.</span>
        )}
        <span className="spacer" />
        <span className="hint">
          {status.lastSuccessAt ? `Zuletzt abgerufen ${when(status.lastSuccessAt)}` : "Noch nicht abgerufen"}
        </span>
        <button className="btn" disabled={busy} onClick={() => void syncNow()}>
          Jetzt abrufen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {status.warnings.length > 0 && (
        <details>
          <summary>{status.warnings.length} Hinweise</summary>
          <ul className="plain warnings">
            {status.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
