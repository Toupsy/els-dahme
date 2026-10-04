import { DomainError, fail } from "./errors";
import { intentSchema, type Intent, type IntentOf, type IntentType } from "./intents";
import { motorOff, motorOn, recordCrew, setHoursBase, setService, setStation, switchTrip } from "./boats";
import { addNote, assignResource, closeIncident, openIncident, releaseResource, reportEvent } from "./incidents";
import { movePerson, setAway, setRosterDay } from "./personnel";
import { appendRadio, assertCorrectable } from "./radio";
import { rigDown, rigUp, setFlag } from "./towers";
import { cloneState, initialState, type State } from "./state";

type Handler<T extends IntentType> = (draft: State, intent: IntentOf<T>) => void;
type Handlers = { [T in IntentType]: Handler<T> };

/**
 * Regel für alle Handler: erst prüfen, dann ändern. Ein Handler wirft nur,
 * bevor er den Entwurf verändert hat.
 */
const handlers: Handlers = {
  "radio.append": (draft, intent) => {
    appendRadio(draft, intent.id, 0, { ...intent.data, at: intent.data.at ?? intent.createdAt }, false);
  },
  "radio.correct": (draft, intent) => {
    assertCorrectable(draft, intent.data.of);
    appendRadio(draft, intent.id, 0, intent.data, false, intent.data.of);
  },
  "settings.update": (draft, intent) => {
    draft.settings = { ...draft.settings, ...intent.data };
  },
  "tower.rigUp": rigUp,
  "tower.rigDown": rigDown,
  "tower.flag": setFlag,
  "boat.motorOn": motorOn,
  "boat.switch": switchTrip,
  "boat.motorOff": motorOff,
  "boat.service": setService,
  "boat.station": setStation,
  "boat.hoursBase": setHoursBase,
  "boat.crew": recordCrew,
  "incident.open": openIncident,
  "incident.assign": assignResource,
  "incident.release": releaseResource,
  "incident.event": reportEvent,
  "incident.note": addNote,
  "incident.close": closeIncident,
  "roster.setDay": setRosterDay,
  "person.move": movePerson,
  "person.away": setAway,
};

/** Prüft die Form einer Aktion und entfernt unbekannte Felder. */
export function parseIntent(input: unknown): Intent {
  const result = intentSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    fail("INVALID_INPUT", `Aktion ungültig${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}.`);
  }
  return result.data;
}

function run(draft: State, intent: Intent) {
  (handlers[intent.type] as Handler<IntentType>)(draft, intent as never);
}

/** Wendet eine Aktion an und liefert einen neuen Zustand. Der alte bleibt unverändert. */
export function applyIntent(state: State, intent: Intent): State {
  const draft = cloneState(state);
  run(draft, intent);
  return draft;
}

export type ReplayResult = { state: State; rejected: { intent: Intent; error: DomainError }[] };

/** Spielt viele Aktionen in Folge ab (Start des Servers, Aufbau im Browser). */
export function replay(intents: Iterable<Intent>, base: State = initialState()): ReplayResult {
  const draft = cloneState(base);
  const rejected: ReplayResult["rejected"] = [];
  for (const intent of intents) {
    try {
      run(draft, intent);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      rejected.push({ intent, error });
    }
  }
  return { state: draft, rejected };
}
