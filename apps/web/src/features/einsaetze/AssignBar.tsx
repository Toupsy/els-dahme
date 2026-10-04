import { useState } from "react";
import {
  BOAT_IDS,
  STATIONS,
  TOWER_IDS,
  boatStatuses,
  incidentOfBoat,
  type Incident,
  type ResourceRef,
} from "@els/domain";
import { useDispatch, useLedger } from "../../core/runtime";

/** Kräfte zuordnen: Boote (starten die Einsatzfahrt), besetzte Türme, Kräfte der Hauptwache. */
export function AssignBar({ incident }: { incident: Incident }) {
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const [count, setCount] = useState(2);
  const boats = boatStatuses(state);
  const freeBoats = BOAT_IDS.filter((id) => boats[id].inService && !incidentOfBoat(state, id));
  const active = incident.resources.filter((r) => !r.releasedAt);
  const towers = TOWER_IDS.filter(
    (id) => state.towers[id].open && !active.some((r) => r.kind === "tower" && r.station === id),
  );
  const assign = (resource: ResourceRef) =>
    void dispatch({ type: "incident.assign", data: { incident: incident.id, resource } });

  return (
    <div className="stack-tight">
      <h3>Kräfte zuordnen</h3>
      <div className="grid-buttons">
        {freeBoats.map((boat) => (
          <button key={boat} className="btn big run" onClick={() => assign({ kind: "boat", boat })}>
            Boot {boat}
            {boats[boat].running ? ` (${boats[boat].running!.purpose})` : ""}
          </button>
        ))}
        {towers.map((station) => (
          <button key={station} className="btn big" onClick={() => assign({ kind: "tower", station })}>
            Turm {STATIONS[station].label}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => setCount(Math.max(1, count - 1))} aria-label="Weniger">
          −
        </button>
        <span>{count}</span>
        <button className="btn" onClick={() => setCount(Math.min(30, count + 1))} aria-label="Mehr">
          +
        </button>
        <button className="btn big" onClick={() => assign({ kind: "team", count })}>
          {count} {count === 1 ? "Kraft" : "Kräfte"} von der HW
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
