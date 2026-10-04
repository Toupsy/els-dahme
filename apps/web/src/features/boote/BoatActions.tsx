import { useState } from "react";
import {
  BOAT_PURPOSES,
  COAST_ORDER,
  STATIONS,
  formatClock,
  formatRuntime,
  roundMinutes,
  parseTs,
  type BoatPurpose,
  type BoatStatus,
  type StationId,
} from "@els/domain";
import { useDispatch, useNow } from "../../core/runtime";

/** Kurze Beschriftung der Zweck-Knöpfe. */
const SHORT: Record<BoatPurpose, string> = {
  Kontrollfahrt: "Kontrollfahrt",
  Einsatzfahrt: "Einsatzfahrt",
  Probefahrt: "Probefahrt",
  Ausbildungsfahrt: "Ausbildung",
  Verlegungsfahrt: "Verlegung …",
  Materialtransport: "Material",
  Abrödelfahrt: "Abrödeln",
};

type Choice = { kind: "none" } | { kind: "target"; mode: "on" | "switch" } | { kind: "moor" } | { kind: "switch" };

/**
 * Bedienung eines Boots – auf der Karte und im Boote-Tab dieselbe.
 * Die wichtigste Aktion ist ein Tipp: „Motor läuft, <Zweck>“ bzw. „Motor aus“.
 */
export function BoatActions({ boat }: { boat: BoatStatus }) {
  const { dispatch, error } = useDispatch();
  const now = useNow(10_000);
  const [choice, setChoice] = useState<Choice>({ kind: "none" });
  const reset = () => setChoice({ kind: "none" });

  if (!boat.inService) return <p className="hint">Außer Dienst. Wieder in Dienst setzen im Boote-Tab.</p>;

  const station = STATIONS[boat.station].label;
  const pickTarget = (mode: "on" | "switch") => setChoice({ kind: "target", mode });

  async function on(purpose: BoatPurpose, target: StationId | null = null) {
    if (purpose === "Verlegungsfahrt" && !target) return pickTarget("on");
    if (await dispatch({ type: "boat.motorOn", data: { boat: boat.id, purpose, target } })) reset();
  }
  async function change(purpose: BoatPurpose, target: StationId | null = null) {
    if (purpose === "Verlegungsfahrt" && !target) return pickTarget("switch");
    if (await dispatch({ type: "boat.switch", data: { boat: boat.id, purpose, target } })) reset();
  }
  async function off(at: StationId | null = null) {
    if (await dispatch({ type: "boat.motorOff", data: { boat: boat.id, station: at } })) reset();
  }

  const stationButtons = (exclude: StationId | null, onPick: (id: StationId) => void) => (
    <div className="grid-buttons">
      {COAST_ORDER.filter((id) => id !== exclude).map((id) => (
        <button key={id} className="btn big" onClick={() => onPick(id)}>
          {STATIONS[id].label}
        </button>
      ))}
      <button className="btn big" onClick={reset}>
        Zurück
      </button>
    </div>
  );

  if (choice.kind === "target")
    return (
      <div className="boat-actions">
        <p className="hint">Verlegung nach:</p>
        {stationButtons(
          boat.station,
          (id) => void (choice.mode === "on" ? on("Verlegungsfahrt", id) : change("Verlegungsfahrt", id)),
        )}
        {error && <p className="error">{error}</p>}
      </div>
    );

  if (!boat.running)
    return (
      <div className="boat-actions">
        <p className="status-line">Motor aus · E-klar {station}</p>
        <div className="grid-buttons">
          {BOAT_PURPOSES.map((p) => (
            <button
              key={p}
              className={p === "Kontrollfahrt" || p === "Einsatzfahrt" ? "btn big run" : "btn big"}
              onClick={() => void on(p)}
            >
              {p === "Verlegungsfahrt" ? SHORT[p] : `Motor läuft, ${SHORT[p]}`}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );

  const running = boat.running;
  const minutes = roundMinutes(now - parseTs(running.since));
  const home = running.target ?? boat.station;

  if (choice.kind === "moor")
    return (
      <div className="boat-actions">
        <p className="hint">Motor aus an:</p>
        {stationButtons(null, (id) => void off(id))}
        {error && <p className="error">{error}</p>}
      </div>
    );

  if (choice.kind === "switch")
    return (
      <div className="boat-actions">
        <p className="hint">Fahrtwechsel zu:</p>
        <div className="grid-buttons">
          {BOAT_PURPOSES.filter((p) => p !== running.purpose || p === "Verlegungsfahrt").map((p) => (
            <button key={p} className="btn big" onClick={() => void change(p)}>
              {SHORT[p]}
            </button>
          ))}
          <button className="btn big" onClick={reset}>
            Zurück
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );

  return (
    <div className="boat-actions">
      <p className="status-line running">
        Motor läuft · {running.purpose}
        {running.target ? ` nach ${STATIONS[running.target].label}` : ""} · seit {formatClock(running.since)} ·{" "}
        {formatRuntime(minutes)}
      </p>
      <button className="btn big danger wide" onClick={() => void off()}>
        Motor aus · {home === "hw" ? "an der Hauptwache" : `E-klar ${STATIONS[home].label}`}
      </button>
      <div className="grid-buttons">
        <button className="btn big" onClick={() => setChoice({ kind: "moor" })}>
          Motor aus an anderem Ort …
        </button>
        <button className="btn big" onClick={() => setChoice({ kind: "switch" })}>
          Fahrtwechsel …
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
