import { COAST_ORDER, STATIONS, TOWER_IDS, type StationId } from "./stations";

export type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
export const GEO = {
  /** Ruhendes Boot: seewärts neben dem Turm. */
  mooringOffsetM: 60,
  /** Vor der Hauptwache liegt das Boot weiter draußen. */
  hqMooringOffsetM: 120,
  /** Fahrendes Boot: hinter der Seebrücke. */
  runningOffsetM: 280,
  /** Abstand mehrerer Boote am selben Liegeplatz (entlang der Küste). */
  fanM: 70,
  /** Punkte mehr als 40 m seewärts der Küstenlinie gelten als Wasser. */
  waterThresholdM: 40,
} as const;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: Point, b: Point): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Peilung von a nach b, im Uhrzeigersinn von Norden. */
export function bearing(a: Point, b: Point): number {
  const dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function offset(point: Point, meters: number, degrees: number): Point {
  const d = meters / EARTH_RADIUS_M;
  const b = rad(degrees);
  const lat = rad(point.lat);
  const lng = rad(point.lng);
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
  const nextLng =
    lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(nextLat));
  return { lat: deg(nextLat), lng: ((deg(nextLng) + 540) % 360) - 180 };
}

/** Küstenachse Süd → Nord; die Seeseite liegt 90° rechts davon. */
export function coastBearing(): number {
  return bearing(STATIONS["9-12"], STATIONS["9-18"]);
}

export function seaBearing(): number {
  return (coastBearing() + 90) % 360;
}

export function stationPoint(id: StationId): Point {
  return { lat: STATIONS[id].lat, lng: STATIONS[id].lng };
}

/** Liegeplatz eines ruhenden Boots; mehrere Boote am selben Ort fächern entlang der Küste auf. */
export function mooringPosition(id: StationId, index = 0, count = 1): Point {
  const base = offset(stationPoint(id), id === "hw" ? GEO.hqMooringOffsetM : GEO.mooringOffsetM, seaBearing());
  return offset(base, (index - (count - 1) / 2) * GEO.fanM, coastBearing());
}

/** Fahrendes Boot: seewärts vor seinem Ausgangspunkt, gefächert wie am Liegeplatz. */
export function runningPosition(id: StationId, index = 0, count = 1): Point {
  const base = offset(stationPoint(id), GEO.runningOffsetM, seaBearing());
  return offset(base, (index - (count - 1) / 2) * GEO.fanM, coastBearing());
}

/** Nächster Turm (ohne Hauptwache) – Vorschlag für den Einsatztitel. */
export function nearestTower(point: Point): StationId {
  let best: StationId = TOWER_IDS[0]!;
  let bestDistance = Infinity;
  for (const id of TOWER_IDS) {
    const d = distanceM(point, stationPoint(id));
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

/** Liegt der Punkt auf der Seeseite der Küstenlinie (mehr als 40 m)? */
export function isWaterLocation(point: Point): boolean {
  let nearest = Infinity;
  let seaward = false;
  for (let i = 1; i < COAST_ORDER.length; i++) {
    const a = stationPoint(COAST_ORDER[i - 1]!);
    const b = stationPoint(COAST_ORDER[i]!);
    const scale = Math.cos(rad(a.lat));
    const dx = (b.lng - a.lng) * scale;
    const dy = b.lat - a.lat;
    const px = (point.lng - a.lng) * scale;
    const py = point.lat - a.lat;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    const closest = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    const d = distanceM(closest, point);
    if (d < nearest) {
      nearest = d;
      seaward = dy * px - dx * py > 0;
    }
  }
  return seaward && nearest > GEO.waterThresholdM;
}
