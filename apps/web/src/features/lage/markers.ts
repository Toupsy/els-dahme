import {
  BOAT_IDS,
  FLAG_LABELS,
  STATION_IDS,
  STATIONS,
  mooringPosition,
  runningPosition,
  stationPoint,
  type BoatStatus,
  type Incident,
  type BoatId,
  type State,
  type StationId,
} from "@els/domain";
import type { MapLine, MapMarker } from "./MapView";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const FLAG_CLASS: Record<string, string> = {
  gelb: "flag-gelb",
  windsack: "flag-windsack",
  gelb_windsack: "flag-gelb-windsack",
  rot: "flag-rot",
};

const PERSON_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.5" r="3"/><path d="M2 15c0-3.6 2.7-6 6-6s6 2.4 6 6z"/></svg>';

/**
 * Türme und HW mit der Zahl der anwesenden Personen laut Wachplan (`counts`).
 * Ein besetzter oder geöffneter Turm zeigt die Zahl immer, ein offener ohne Personen fällt mit 0 auf.
 */
export function stationMarkers(state: State, counts: Partial<Record<StationId, number>> = {}): MapMarker[] {
  return STATION_IDS.map((id) => {
    const tower = state.towers[id];
    const count = counts[id] ?? 0;
    const open = id === "hw" || tower.open;
    const flag = tower.flag
      ? `<i class="flag ${FLAG_CLASS[tower.flag]}" title="${esc(FLAG_LABELS[tower.flag]!)}"></i>`
      : "";
    const crew =
      count > 0 || open
        ? `<small class="crew${count === 0 ? " empty" : ""}" title="${count} ${count === 1 ? "Person" : "Personen"} anwesend">${PERSON_ICON}${count}</small>`
        : "";
    return {
      key: `station:${id}`,
      point: stationPoint(id),
      html: `<span class="pin-label">${esc(STATIONS[id].label)}</span>${crew}${flag}`,
      className: id === "hw" ? "hq" : tower.open ? "tower open" : "tower closed",
      size: [id === "hw" ? 52 : 46, crew ? 42 : 30],
      zIndex: 100,
    };
  });
}

/** Boote am Liegeplatz bzw. auf See; mehrere am selben Ort fächern auf. Außer Dienst wird ausgeblendet. */
export function boatMarkers(boats: Record<BoatId, BoatStatus>): { markers: MapMarker[]; lines: MapLine[] } {
  const visible = BOAT_IDS.map((id) => boats[id]).filter((b) => b.inService);
  const groups = new Map<string, BoatStatus[]>();
  for (const b of visible) {
    const key = `${b.running ? "sea" : "moor"}:${b.station}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const markers: MapMarker[] = [];
  const lines: MapLine[] = [];
  for (const group of groups.values())
    group.forEach((b, index) => {
      const point = b.running
        ? runningPosition(b.station, index, group.length)
        : mooringPosition(b.station, index, group.length);
      const purpose = b.running ? `<small>${esc(b.running.purpose.replace("fahrt", ""))}</small>` : "";
      markers.push({
        key: `boat:${b.id}`,
        point,
        html: `<span class="pin-label">${b.id}</span>${purpose}`,
        className: b.running ? "boat running" : "boat idle",
        size: b.running ? [86, 38] : [58, 28],
        zIndex: b.running ? 300 : 200,
      });
      if (b.running?.target)
        lines.push({
          key: `transfer:${b.id}`,
          points: [point, mooringPosition(b.running.target as StationId)],
          className: "transfer-line",
        });
    });
  return { markers, lines };
}

/** Aktive Einsätze mit gestrichelter Anfahrtslinie von der Hauptwache. */
export function incidentMarkers(incidents: Incident[]): { markers: MapMarker[]; lines: MapLine[] } {
  return {
    markers: incidents.map((i) => ({
      key: `incident:${i.id}`,
      point: i.point,
      html: `<span class="pin-label">E${i.number}</span>`,
      className: "incident",
      size: [40, 40],
      zIndex: 400,
    })),
    lines: incidents.map((i) => ({
      key: `route:${i.id}`,
      points: [stationPoint("hw"), i.point],
      className: "hq-route",
    })),
  };
}
