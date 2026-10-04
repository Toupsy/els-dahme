import "./personal.css";
import { useState } from "react";
import { COAST_ORDER, dutyRoster, occupancy, stationTitle, watchDate } from "@els/domain";
import { DayBar } from "../../components/DayBar";
import { useLedger, useRuntime } from "../../core/runtime";
import { ImportPanel } from "./ImportPanel";
import { PersonRow } from "./PersonRow";

/** Besetzung eines Tages je Station; Wachplan-Import. */
export function PersonalPage() {
  const runtime = useRuntime();
  const { state } = useLedger();
  const [date, setDate] = useState(() => watchDate(runtime.now()));
  const [importing, setImporting] = useState(false);
  const people = dutyRoster(state, date);
  const present = occupancy(state, date);
  const away = people.filter((p) => p.away);
  const onTrip = people.filter((p) => p.onTrip && !p.away);

  return (
    <div className="stack">
      <div className="row">
        <DayBar date={date} onChange={setDate} />
        <span className="spacer" />
        <button className="btn big" onClick={() => setImporting(!importing)}>
          Wachplan einlesen …
        </button>
      </div>
      {importing && <ImportPanel onDone={() => setImporting(false)} />}
      {!people.length && <p className="empty card">Für diesen Tag ist kein Wachplan eingelesen.</p>}
      {people.length > 0 && (
        <div className="crew-grid">
          {COAST_ORDER.map((id) => (
            <section key={id} className="card">
              <h2>
                {stationTitle(id)} <span className="count">{present[id].length}</span>
              </h2>
              {id !== "hw" && <p className="hint">{state.towers[id].open ? "Aufgerödelt" : "Nicht aufgerödelt"}</p>}
              <ul className="plain">
                {present[id].map((p) => (
                  <PersonRow key={p.id} person={p} date={date} />
                ))}
              </ul>
            </section>
          ))}
          {onTrip.length > 0 && (
            <section className="card">
              <h2>
                Auf Fahrt <span className="count">{onTrip.length}</span>
              </h2>
              <ul className="plain">
                {onTrip.map((p) => (
                  <PersonRow key={p.id} person={p} date={date} />
                ))}
              </ul>
            </section>
          )}
          {away.length > 0 && (
            <section className="card">
              <h2>
                Abwesend <span className="count">{away.length}</span>
              </h2>
              <ul className="plain">
                {away.map((p) => (
                  <PersonRow key={p.id} person={p} date={date} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
