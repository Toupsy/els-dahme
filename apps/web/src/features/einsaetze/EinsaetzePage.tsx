import "./einsaetze.css";
import { useState } from "react";
import {
  COAST_ORDER,
  STATIONS,
  activeIncidents,
  offset,
  seaBearing,
  stationPoint,
  watchDate,
  type Point,
} from "@els/domain";
import { DayBar } from "../../components/DayBar";
import { go } from "../../core/route";
import { useLedger, useRuntime } from "../../core/runtime";
import { IncidentDetail } from "./IncidentDetail";
import { IncidentForm } from "./IncidentForm";

/** Aktive Einsätze oben, abgeschlossene des gewählten Tages darunter. */
export function EinsaetzePage() {
  const runtime = useRuntime();
  const { state } = useLedger();
  const [date, setDate] = useState(() => watchDate(runtime.now()));
  const [creating, setCreating] = useState<"place" | Point | null>(null);
  const active = activeIncidents(state);
  const closed = Object.values(state.incidents)
    .filter((i) => i.closedAt && watchDate(i.openedAt) === date)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  return (
    <div className="stack">
      <div className="row">
        <button className="btn big danger" onClick={() => setCreating("place")}>
          Neuer Einsatz
        </button>
        <button className="btn big" onClick={() => go("lage", "einsatz")}>
          Auf der Karte anlegen
        </button>
      </div>

      {creating === "place" && (
        <section className="card stack-tight">
          <h2>Wo?</h2>
          <p className="hint">Vor welchem Turm? Genauer geht es auf der Karte.</p>
          <div className="grid-buttons">
            {COAST_ORDER.map((id) => (
              <button
                key={id}
                className="btn big"
                onClick={() => setCreating(offset(stationPoint(id), 120, seaBearing()))}
              >
                vor {STATIONS[id].label}
              </button>
            ))}
            <button className="btn big" onClick={() => setCreating(null)}>
              Abbrechen
            </button>
          </div>
        </section>
      )}
      {creating && creating !== "place" && (
        <section className="card">
          <IncidentForm point={creating} onDone={() => setCreating(null)} />
        </section>
      )}

      {active.length === 0 && !creating && <p className="empty card">Kein laufender Einsatz.</p>}
      {active.map((incident) => (
        <section key={incident.id} className="card incident-card active">
          <IncidentDetail incident={incident} />
        </section>
      ))}

      <h2>Abgeschlossen</h2>
      <DayBar date={date} onChange={setDate} />
      {closed.length === 0 && <p className="empty">Keine abgeschlossenen Einsätze an diesem Tag.</p>}
      {closed.map((incident) => (
        <section key={incident.id} className="card incident-card">
          <IncidentDetail incident={incident} />
        </section>
      ))}
    </div>
  );
}
