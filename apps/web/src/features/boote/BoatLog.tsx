import { useState } from "react";
import {
  formatClock,
  formatHours,
  formatRuntime,
  hoursInputValue,
  parseHoursInput,
  purposeInBook,
  tripPurpose,
  watchDate,
  type DayTrip,
  type LogbookDay,
} from "@els/domain";
import { go } from "../../core/route";
import { useDispatch, useLedger } from "../../core/runtime";

/** Fahrten des Tages in der Spaltenfolge des DLRG-Bootstagebuchs, darunter die Betriebsstunden. */
export function BoatLog({ log }: { log: LogbookDay }) {
  const [form, setForm] = useState<"none" | "hours" | "crew">("none");
  return (
    <div className="boat-log">
      <TripTable trips={log.trips} />
      <div className="hours-block" data-testid={`hours-${log.boat}`}>
        <span>
          Einsatztag <b>{formatHours(log.hours.dayMin)}</b>
        </span>
        <span>
          Übertrag <b>{formatHours(log.hours.carryMin)}</b>
        </span>
        <span className="total">
          Gesamt <b>{formatHours(log.hours.totalMin)}</b>
        </span>
      </div>
      <p className="hint">
        Besatzung:{" "}
        {log.crew ? `${log.crew.bootsfuehrer} (Bootsführer), ${log.crew.bootsgast} (Bootsgast)` : "nicht eingetragen"}
      </p>
      <div className="row">
        <button className="btn" onClick={() => go("boote", "blatt", log.boat, log.date)}>
          Tagebuch-Blatt
        </button>
        <button className="btn" onClick={() => setForm(form === "crew" ? "none" : "crew")}>
          Besatzung …
        </button>
        <button className="btn" onClick={() => setForm(form === "hours" ? "none" : "hours")}>
          Übertrag …
        </button>
      </div>
      {form === "hours" && <HoursBaseForm log={log} onDone={() => setForm("none")} />}
      {form === "crew" && <CrewForm log={log} onDone={() => setForm("none")} />}
    </div>
  );
}

export function TripTable({ trips, rows = 0 }: { trips: DayTrip[]; rows?: number }) {
  const filler = Math.max(0, rows - trips.length);
  if (!trips.length && !rows) return <p className="empty">Keine Fahrt an diesem Tag.</p>;
  return (
    <table className="trip-table">
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Motor angest.</th>
          <th>Motor abgest.</th>
          <th>Laufzeit (min)</th>
          <th>Einsatzzweck</th>
        </tr>
      </thead>
      <tbody>
        {trips.map((t, i) => (
          <tr key={t.startedAt} className={t.running ? "running" : undefined}>
            <td>{i + 1}</td>
            <td>{formatClock(t.startedAt)}</td>
            <td>{t.endedAt ? formatClock(t.endedAt) : t.running ? "läuft" : "offen"}</td>
            <td title={formatRuntime(t.minutes)}>{t.minutes}</td>
            <td>
              {tripPurpose(t)}
              {t.legs.length > 1 && (
                <small className="legs">
                  {t.legs
                    .map((l, j) => `ab ${formatClock(l.startedAt)} ${purposeInBook(l.reason)} (${t.legMinutes[j]} min)`)
                    .join(" · ")}
                </small>
              )}
            </td>
          </tr>
        ))}
        {Array.from({ length: filler }, (_, i) => (
          <tr key={`leer-${i}`} className="empty-row">
            <td>{trips.length + i + 1}</td>
            <td />
            <td />
            <td />
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HoursBaseForm({ log, onDone }: { log: LogbookDay; onDone: () => void }) {
  const { state } = useLedger();
  const base = state.boats[log.boat].hoursBase;
  const { dispatch, error } = useDispatch();
  const [hours, setHours] = useState(hoursInputValue(base.minutes));
  const [since, setSince] = useState(base.since ? watchDate(base.since) : "");
  const [inputError, setInputError] = useState<string | null>(null);

  async function save() {
    let minutes: number;
    try {
      minutes = parseHoursInput(hours);
    } catch (e) {
      return setInputError((e as Error).message);
    }
    setInputError(null);
    if (await dispatch({ type: "boat.hoursBase", data: { boat: log.boat, minutes, since: since || null } })) onDone();
  }

  return (
    <div className="inline-form">
      <p className="hint">
        Stand aus dem Papierbuch (Zeile „Übertrag“) und der Tag, ab dem die App die Fahrten dazuzählt. Ohne Stichtag
        zählen alle erfassten Fahrten.
      </p>
      <label>
        Übertrag (Std.){" "}
        <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="121,75 oder 121:45" />
      </label>
      <label>
        Ab Stichtag <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
      </label>
      <button className="btn primary" onClick={() => void save()}>
        Speichern
      </button>
      {(inputError ?? error) && <p className="error">{inputError ?? error}</p>}
    </div>
  );
}

function CrewForm({ log, onDone }: { log: LogbookDay; onDone: () => void }) {
  const { dispatch, error } = useDispatch();
  const [leader, setLeader] = useState(log.crew?.bootsfuehrer ?? "");
  const [guest, setGuest] = useState(log.crew?.bootsgast ?? "");
  async function save() {
    if (
      await dispatch({
        type: "boat.crew",
        data: { boat: log.boat, date: log.date, bootsfuehrer: leader, bootsgast: guest },
      })
    )
      onDone();
  }
  return (
    <div className="inline-form">
      <label>
        Bootsführer <input value={leader} onChange={(e) => setLeader(e.target.value)} />
      </label>
      <label>
        Bootsgast <input value={guest} onChange={(e) => setGuest(e.target.value)} />
      </label>
      <button className="btn primary" disabled={!leader.trim() || !guest.trim()} onClick={() => void save()}>
        Eintragen
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
