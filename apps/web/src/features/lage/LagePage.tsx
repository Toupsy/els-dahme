import "./lage.css";
import "../einsaetze/einsaetze.css";
import { useMemo, useState } from "react";
import {
  activeIncidents,
  boatStatuses,
  occupancy,
  watchDate,
  type BoatId,
  type Point,
  type StationId,
} from "@els/domain";
import { go } from "../../core/route";
import { useLedger, useNow } from "../../core/runtime";
import { BoatActions } from "../boote/BoatActions";
import { IncidentDetail } from "../einsaetze/IncidentDetail";
import { IncidentForm } from "../einsaetze/IncidentForm";
import { Dialog } from "./Dialog";
import { FunkPanel } from "./FunkPanel";
import { MapView } from "./MapView";
import { boatMarkers, incidentMarkers, stationMarkers } from "./markers";
import { StationPanel } from "./StationPanel";

export type Selection =
  | { kind: "station"; id: StationId }
  | { kind: "boat"; id: BoatId }
  | { kind: "incident"; id: string }
  | { kind: "new"; point: Point }
  | null;

/**
 * #/lage, #/lage/einsatz (Tippen auf die Karte eröffnet einen Einsatz).
 * Turm, Boot oder Einsatz öffnen ein Popup; daneben stehen Funktagebuch und Notizen.
 */
export function LagePage({ rest }: { rest: string[] }) {
  const { state } = useLedger();
  const [selection, setSelection] = useState<Selection>(null);
  const [north, setNorth] = useState(false);
  const pressMode = rest[0] === "einsatz";
  const boats = boatStatuses(state);
  const incidents = activeIncidents(state);
  const today = watchDate(useNow(60_000));

  const { markers, lines } = useMemo(() => {
    const b = boatMarkers(boats);
    const i = incidentMarkers(incidents);
    const present = occupancy(state, today);
    const counts = Object.fromEntries(Object.entries(present).map(([id, people]) => [id, people.length]));
    return { markers: [...stationMarkers(state, counts), ...b.markers, ...i.markers], lines: [...b.lines, ...i.lines] };
  }, [state, boats, incidents, today]);

  function select(key: string) {
    const [kind, id] = key.split(":") as [string, string];
    if (kind === "station") setSelection({ kind, id: id as StationId });
    if (kind === "boat") setSelection({ kind, id: id as BoatId });
    if (kind === "incident") setSelection({ kind, id });
  }

  function press(point: Point) {
    setSelection({ kind: "new", point: { lat: point.lat, lng: point.lng } });
    if (pressMode) go("lage");
  }

  const incident = selection?.kind === "incident" ? state.incidents[selection.id] : undefined;

  return (
    <div className="lage">
      <div className="lage-map">
        <MapView
          markers={markers}
          lines={lines}
          bearing={north ? 0 : state.settings.mapBearing}
          onSelect={select}
          onPress={press}
          pressMode={pressMode}
        />
        <div className="map-tools">
          <button className="btn" onClick={() => setNorth(!north)} title="Kartenausrichtung">
            {north ? "Seeseite oben" : "Norden oben"}
          </button>
          <button
            className={pressMode ? "btn danger" : "btn"}
            onClick={() => go("lage", ...(pressMode ? [] : ["einsatz"]))}
          >
            {pressMode ? "Ort antippen … (Abbrechen)" : "Einsatz anlegen"}
          </button>
        </div>
      </div>
      <aside className="lage-panel">
        <FunkPanel />
      </aside>
      {selection && (
        <Dialog label={dialogLabel(selection)} onClose={() => setSelection(null)}>
          {selection.kind === "station" && <StationPanel id={selection.id} />}
          {selection.kind === "boat" && (
            <div className="stack-tight">
              <h2>Boot {selection.id}</h2>
              <BoatActions boat={boats[selection.id]} />
            </div>
          )}
          {selection.kind === "new" && (
            <IncidentForm point={selection.point} onDone={(id) => setSelection(id ? { kind: "incident", id } : null)} />
          )}
          {incident && <IncidentDetail incident={incident} />}
        </Dialog>
      )}
    </div>
  );
}

function dialogLabel(selection: NonNullable<Selection>): string {
  if (selection.kind === "station") return selection.id === "hw" ? "Hauptwache" : `Turm ${selection.id}`;
  if (selection.kind === "boat") return `Boot ${selection.id}`;
  return "Einsatz";
}
