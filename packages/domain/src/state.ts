import { MAP_DEFAULTS } from "./stations";

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

export type Settings = {
  mapBearing: number;
};

/**
 * Fakten aus angenommenen Aktionen. Abgeleitete Werte (Besetzung, Bootsstatus,
 * Fahrten, Betriebsstunden) stehen nicht hier, sie werden aus diesen Fakten
 * berechnet.
 */
export type State = {
  radio: RadioEntry[];
  settings: Settings;
};

export function initialState(): State {
  return {
    radio: [],
    settings: { mapBearing: MAP_DEFAULTS.bearing },
  };
}

/** Flache Kopie der Container. Der Reducer ersetzt verschachtelte Objekte, statt sie zu ändern. */
export function cloneState(state: State): State {
  return {
    ...state,
    radio: state.radio.slice(),
    settings: { ...state.settings },
  };
}
