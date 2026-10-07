import { boatStatuses } from "./boats";
import { fail } from "./errors";
import type { IntentOf } from "./intents";
import type { RosterPerson } from "./roster";
import type { State } from "./state";
import { COAST_ORDER, STATIONS, type StationId } from "./stations";

export function setRosterDay(draft: State, intent: IntentOf<"roster.setDay">) {
  const { date, people } = intent.data;
  const ids = new Set<string>();
  for (const p of people) {
    if (ids.has(p.id)) fail("INVALID_INPUT", `${p.name} ist doppelt eingeteilt.`);
    if (!p.station && !p.boat) fail("INVALID_INPUT", `${p.name}: Standort fehlt.`);
    ids.add(p.id);
  }
  draft.roster[date] = people;
  // Änderungen zu Personen, die im neuen Plan fehlen, entfallen.
  const changes = draft.rosterChanges[date] ?? {};
  draft.rosterChanges[date] = Object.fromEntries(Object.entries(changes).filter(([id]) => ids.has(id)));
}

function personOf(state: State, date: string, id: string): RosterPerson {
  const person = state.roster[date]?.find((p) => p.id === id);
  if (!person) fail("CONFLICT", "Person steht nicht im Wachplan dieses Tages.");
  return person;
}

export function movePerson(draft: State, intent: IntentOf<"person.move">) {
  const { date, person, station } = intent.data;
  const p = personOf(draft, date, person);
  const day = draft.rosterChanges[date] ?? {};
  if ((day[person]?.station ?? p.station) === station) fail("INVALID_TRANSITION", `${p.name} ist bereits dort.`);
  draft.rosterChanges[date] = { ...day, [person]: { ...day[person], station } };
}

export function setAway(draft: State, intent: IntentOf<"person.away">) {
  const { date, person, away } = intent.data;
  const p = personOf(draft, date, person);
  const day = draft.rosterChanges[date] ?? {};
  if ((day[person]?.away ?? false) === away)
    fail("INVALID_TRANSITION", `${p.name} ist bereits ${away ? "abwesend" : "anwesend"}.`);
  draft.rosterChanges[date] = { ...day, [person]: { ...day[person], away } };
}

export type DutyPerson = RosterPerson & { at: StationId; away: boolean; moved: boolean; onTrip: boolean };

/**
 * Besetzung eines Tages, berechnet aus Plan und Änderungen. Bootsbesatzung
 * steht dort, wo ihr Boot liegt; während einer Fahrt ist sie auf dem Boot.
 */
export function dutyRoster(state: State, date: string): DutyPerson[] {
  const changes = state.rosterChanges[date] ?? {};
  const boats = boatStatuses(state);
  return (state.roster[date] ?? []).map((p) => {
    const change = changes[p.id] ?? {};
    const boat = p.boat && !p.station ? boats[p.boat] : null;
    const planned = p.station ?? boat?.station ?? "hw";
    return {
      ...p,
      at: change.station ?? planned,
      away: change.away ?? false,
      moved: change.station !== undefined,
      onTrip: change.station === undefined && !!boat?.running,
    };
  });
}

/** Anwesende je Station (Küstenreihenfolge). Besatzung eines fahrenden Boots zählt nicht am Liegeplatz. */
export function occupancy(state: State, date: string): Record<StationId, DutyPerson[]> {
  const result = Object.fromEntries(COAST_ORDER.map((id) => [id, [] as DutyPerson[]])) as Record<
    StationId,
    DutyPerson[]
  >;
  for (const p of dutyRoster(state, date)) if (!p.away && !p.onTrip) result[p.at].push(p);
  return result;
}

export function stationTitle(id: StationId): string {
  return id === "hw" ? "Hauptwache" : `Turm ${STATIONS[id].label}`;
}
