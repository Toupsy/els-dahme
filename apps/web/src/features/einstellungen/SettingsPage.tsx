import { useState } from "react";
import { formatClock } from "@els/domain";
import { useLedger, useRuntime } from "../../core/runtime";
import { MapSettings } from "./MapSettings";

export function SettingsPage() {
  const runtime = useRuntime();
  const { rejected } = useLedger();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="stack">
      <MapSettings />
      {rejected.length > 0 && (
        <section className="card">
          <h2>Abgewiesene Aktionen</h2>
          <p className="hint">
            Diese Eingaben hat der Server nicht übernommen. Bitte prüfen und bei Bedarf neu erfassen.
          </p>
          <ul className="plain">
            {rejected.map((r) => (
              <li key={r.intent.id}>
                {formatClock(r.intent.createdAt)} · {r.intent.type}: {r.message}
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => void runtime.ledger.clearRejected()}>
            Liste leeren
          </button>
        </section>
      )}

      {runtime.mode === "demo" && (
        <section className="card">
          <h2>Demo</h2>
          <p className="hint">
            Alle Änderungen bleiben in diesem Browser. Zurücksetzen stellt die Beispieldaten wieder her.
          </p>
          {confirmReset ? (
            <div className="row">
              <button className="btn danger big" onClick={() => void runtime.resetDemo?.()}>
                Ja, zurücksetzen
              </button>
              <button className="btn big" onClick={() => setConfirmReset(false)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <button className="btn big" onClick={() => setConfirmReset(true)}>
              Demo zurücksetzen
            </button>
          )}
        </section>
      )}

      {runtime.logout && (
        <section className="card">
          <h2>Sitzung</h2>
          <button className="btn big" onClick={() => void runtime.logout?.()}>
            Abmelden
          </button>
        </section>
      )}

      <section className="card">
        <h2>Gerät</h2>
        <p className="hint">
          Geräte-ID {runtime.ledger.deviceId.slice(0, 8)} · Stand {runtime.ledger.cursor}
        </p>
      </section>
    </div>
  );
}
