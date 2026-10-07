import type { Incident } from "./incidents";
import type { FLAGS } from "./intents";
import type { RosterPerson } from "./roster";
import { BOAT_IDS, MAP_DEFAULTS, STATION_IDS, type BoatId, type StationId } from "./stations";

export type Flag = (typeof FLAGS)[number];

export type RadioEntry = {
  /** Eintrags-ID: `<intentId>` oder `<intentId>:<n>` bei mehreren Einträgen je Aktion. */
  id: string;
  intentId: string;
  /** Funkzeit, UTC, ganze Sekunden. */
  at: string;
  from: string;
  to: string;
  text: string;
  /** Korrektur ersetzt in allen Auswertungen den genannten Eintrag. */
  correctionOf: string | null;
  /** Automatisch aus einer Statusänderung erzeugt. */
  auto: boolean;
};

/** Bootsbesatzung eines Tages; append-only, der letzte Eintrag gilt. */
export type CrewEntry = {
  id: string;
  boat: BoatId;
  date: string;
  bootsfuehrer: string;
  bootsgast: string;
  at: string;
};

export type Settings = {
  mapBearing: number;
};

export type TowerState = { open: boolean; flag: Flag };

/** Gespeicherte Fakten zu einem Boot. Status, Liegeplatz und Fahrten werden daraus und aus dem Funk berechnet. */
export type BoatFacts = {
  inService: boolean;
  /** Übertrag aus dem Papierbuch und Stichtag (00:00 Ortszeit, UTC). */
  hoursBase: { minutes: number; since: string | null };
  /** Verwaltungs-Korrekturen des Liegeplatzes (ohne Fahrt). */
  moves: { at: string; station: StationId }[];
  /** Außer- und Wieder-in-Dienst-Zeitpunkte für die Anzeige. */
  serviceAt: string | null;
};

/**
 * Fakten aus angenommenen Aktionen. Abgeleitete Werte (Besetzung, Bootsstatus,
 * Fahrten, Betriebsstunden) stehen nicht hier, sie werden aus diesen Fakten
 * berechnet.
 */
export type State = {
  radio: RadioEntry[];
  crew: CrewEntry[];
  towers: Record<StationId, TowerState>;
  boats: Record<BoatId, BoatFacts>;
  incidents: Record<string, Incident>;
  /** Wachplan je Tag (importiert) und die Änderungen des Tages je Person. */
  roster: Record<string, RosterPerson[]>;
  rosterChanges: Record<string, Record<string, PersonChange>>;
  /** Stationen, die an einem Tag mit einer Person weniger besetzt sind („−1“), ohne Namen. */
  stationShort: Record<string, StationId[]>;
  settings: Settings;
};

export type PersonChange = { station?: StationId; away?: boolean };

export function initialState(): State {
  return {
    radio: [],
    crew: [],
    towers: Object.fromEntries(STATION_IDS.map((id) => [id, { open: id === "hw", flag: "" }])) as State["towers"],
    boats: Object.fromEntries(
      BOAT_IDS.map((id): [BoatId, BoatFacts] => [
        id,
        { inService: true, hoursBase: { minutes: 0, since: null }, moves: [], serviceAt: null },
      ]),
    ) as State["boats"],
    incidents: {},
    roster: {},
    rosterChanges: {},
    stationShort: {},
    settings: { mapBearing: MAP_DEFAULTS.bearing },
  };
}

/** Flache Kopie der Container. Der Reducer ersetzt verschachtelte Objekte, statt sie zu ändern. */
export function cloneState(state: State): State {
  return {
    ...state,
    radio: state.radio.slice(),
    crew: state.crew.slice(),
    towers: { ...state.towers },
    boats: { ...state.boats },
    incidents: { ...state.incidents },
    roster: { ...state.roster },
    rosterChanges: { ...state.rosterChanges },
    stationShort: { ...state.stationShort },
    settings: { ...state.settings },
  };
}
