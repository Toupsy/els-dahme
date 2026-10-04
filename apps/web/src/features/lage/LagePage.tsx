import "./lage.css";
import { useMemo, useState } from "react";
import {
  BOAT_IDS,
  STATIONS,
  TOWER_IDS,
  boatStatuses,
  formatRuntime,
  parseTs,
  roundMinutes,
  type BoatId,
  type StationId,
} from "@els/domain";
import { useLedger, useNow } from "../../core/runtime";
import { BoatActions } from "../boote/BoatActions";
import { MapView } from "./MapView";
import { boatMarkers, stationMarkers } from "./markers";
import { StationPanel } from "./StationPanel";

type Selection = { kind: "station"; id: StationId } | { kind: "boat"; id: BoatId } | null;

export function LagePage() {
  const { state } = useLedger();
  const [selection, setSelection] = useState<Selection>(null);
  const [north, setNorth] = useState(false);
  const boats = boatStatuses(state);

  const { markers, lines } = useMemo(() => {
    const b = boatMarkers(boats);
    return { markers: [...stationMarkers(state), ...b.markers], lines: b.lines };
  }, [state, boats]);

  function select(key: string) {
    const [kind, id] = key.split(":") as [string, string];
    if (kind === "station") setSelection({ kind, id: id as StationId });
    if (kind === "boat") setSelection({ kind, id: id as BoatId });
  }

  return (
    <div className="lage">
      <div className="lage-map">
        <MapView markers={markers} lines={lines} bearing={north ? 0 : state.settings.mapBearing} onSelect={select} />
        <button className="btn map-north" onClick={() => setNorth(!north)} title="Kartenausrichtung">
          {north ? "Seeseite oben" : "Norden oben"}
        </button>
      </div>
      <aside className="lage-panel">
        {selection && (
          <button className="btn close" onClick={() => setSelection(null)} aria-label="Auswahl schließen">
            ✕
          </button>
        )}
        {selection?.kind === "station" && <StationPanel id={selection.id} />}
        {selection?.kind === "boat" && (
          <div className="stack-tight">
            <h2>Boot {selection.id}</h2>
            <BoatActions boat={boats[selection.id]} />
          </div>
        )}
        {!selection && <Overview onSelect={setSelection} />}
      </aside>
    </div>
  );
}

function Overview({ onSelect }: { onSelect: (s: Selection) => void }) {
  const { state } = useLedger();
  const now = useNow(10_000);
  const boats = boatStatuses(state);
  const open = TOWER_IDS.filter((id) => state.towers[id].open);
  const running = BOAT_IDS.map((id) => boats[id]).filter((b) => b.running);

  return (
    <div className="stack-tight">
      <h2>Lage</h2>
      <p className="hint">Turm oder Boot auf der Karte antippen.</p>
      <h3>Boote unterwegs</h3>
      {running.length === 0 && <p className="empty">Keine Fahrt.</p>}
      {running.map((b) => (
        <button key={b.id} className="list-button running" onClick={() => onSelect({ kind: "boat", id: b.id })}>
          <b>{b.id}</b> {b.running!.purpose}
          {b.running!.target ? ` nach ${STATIONS[b.running!.target].label}` : ""}
          <span>{formatRuntime(roundMinutes(now - parseTs(b.running!.since)))}</span>
        </button>
      ))}
      <h3>Türme</h3>
      <p>{open.length ? `Besetzt: ${open.map((id) => STATIONS[id].label).join(", ")}` : "Kein Turm besetzt."}</p>
    </div>
  );
}
