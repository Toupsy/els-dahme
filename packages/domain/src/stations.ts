/** Stammdaten des Reviers Dahme. Die einzige Stelle mit Koordinaten. */
export const STATIONS = {
  hw: { label: "HW", radio: "AD", lat: 54.22532166048048, lng: 11.087506408117333 },
  "9-12": { label: "9-12", radio: "9-12", lat: 54.220493453322625, lng: 11.090132353961941 },
  "9-13": { label: "9-13", radio: "9-13", lat: 54.22345881405984, lng: 11.089131885547348 },
  "9-14": { label: "9-14", radio: "9-14", lat: 54.22817064936492, lng: 11.087501109589557 },
  "9-15": { label: "9-15", radio: "9-15", lat: 54.23198833113125, lng: 11.086106503367292 },
  "9-16": { label: "9-16", radio: "9-16", lat: 54.237481410447806, lng: 11.084368146994722 },
  "9-17": { label: "9-17", radio: "9-17", lat: 54.24018065238213, lng: 11.083542197576664 },
  "9-18": { label: "9-18", radio: "9-18", lat: 54.24289852594964, lng: 11.082946663476907 },
} as const;

export type StationId = keyof typeof STATIONS;
export const STATION_IDS = Object.keys(STATIONS) as StationId[];
export const TOWER_IDS = STATION_IDS.filter((id) => id !== "hw");

/** Küstenreihenfolge Süd → Nord. */
export const COAST_ORDER: readonly StationId[] = ["9-12", "9-13", "hw", "9-14", "9-15", "9-16", "9-17", "9-18"];

export const BOAT_IDS = ["78-1", "78-2", "78-3"] as const;
export type BoatId = (typeof BOAT_IDS)[number];

/** Liegeplätze zu Saisonbeginn; änderbar in den Einstellungen. */
export const DEFAULT_BOAT_HOMES: Record<BoatId, StationId> = {
  "78-1": "9-12",
  "78-2": "9-14",
  "78-3": "9-17",
};

/** Die Hauptwache heißt im Funk „AD“, auf der Karte „HW“. */
export const HQ_CALL_SIGN = "AD";
export const RADIO_CALL_SIGNS = [HQ_CALL_SIGN, ...TOWER_IDS, ...BOAT_IDS, "Alle", "Leitstelle"] as const;

export const MAP_DEFAULTS = {
  center: { lat: 54.2325, lng: 11.0865 },
  zoom: 15,
  /** Strand-Ansicht: Seeseite oben (wie in der Feature-App). */
  bearing: 281,
} as const;

export function isStationId(value: string): value is StationId {
  return Object.hasOwn(STATIONS, value);
}

export function isBoatId(value: string): value is BoatId {
  return (BOAT_IDS as readonly string[]).includes(value);
}

export function stationLabel(id: StationId): string {
  return STATIONS[id].label;
}

/** Rufname im Funk → Station (AD → hw). */
export function stationOfCallSign(sign: string): StationId | null {
  if (sign === HQ_CALL_SIGN || sign === "HW") return "hw";
  return isStationId(sign) ? sign : null;
}
