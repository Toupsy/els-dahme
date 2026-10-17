import { boatHours, dayCap, dayTrips, type BoatHours, type DayTrip } from "./boatlog";
import { crewOf, deriveBoat } from "./boats";
import { dutyRoster } from "./personnel";
import { effectiveRadioOf } from "./radio";
import type { State } from "./state";
import type { BoatId, StationId } from "./stations";
import { parseTs } from "./time";

/** Besatzung im Tagebuch: im Boote-Tab eingetragen oder aus dem Wachplan des Tages berechnet. */
export type LogbookCrew = { source: "entry" | "plan"; bootsfuehrer: string[]; bootsgaeste: string[] };

export type LogbookDay = {
  boat: BoatId;
  date: string;
  trips: DayTrip[];
  hours: BoatHours;
  crew: LogbookCrew | null;
};

/** Ein Boot, ein Tag – dieselben Zahlen für Boote-Tab und Tagebuch-Blatt. */
export function logbookDay(state: State, boat: BoatId, date: string, now: number): LogbookDay {
  const entries = effectiveRadioOf(state);
  const trips = dayTrips(entries, boat, date, now);
  return {
    boat,
    date,
    trips,
    hours: boatHours(entries, boat, date, now, state.boats[boat].hoursBase),
    crew: logbookCrew(state, boat, date, trips, now),
  };
}

/**
 * Ein Eintrag im Boote-Tab gilt vor dem Wachplan. Ohne Eintrag ist Bootsführer,
 * wer im Plan auf dem Boot steht und weder umgesetzt noch abwesend ist.
 * Bootsgäste sind die Turmbesatzung am Liegeplatz: bei Fahrten an jedem
 * Ausgangspunkt des Tages, sonst dort, wo das Boot zum Tagesende liegt.
 */
export function logbookCrew(
  state: State,
  boat: BoatId,
  date: string,
  trips: readonly DayTrip[],
  now: number,
): LogbookCrew | null {
  const entry = crewOf(state, boat, date);
  if (entry) return { source: "entry", bootsfuehrer: [entry.bootsfuehrer], bootsgaeste: [entry.bootsgast] };
  const people = dutyRoster(state, date).filter((p) => !p.away);
  const effective = effectiveRadioOf(state);
  const moments = trips.length ? trips.map((t) => parseTs(t.startedAt)) : [dayCap(date, now)];
  const stations = new Set<StationId>(moments.map((t) => deriveBoat(state, boat, effective, t).station));
  const onBoard = people.filter((p) => p.boat === boat && !p.moved);
  const guests = [
    ...onBoard.filter((p) => p.role !== "BF"),
    ...people.filter((p) => stations.has(p.at) && !(p.boat && !p.moved)),
  ];
  const leaders = onBoard.filter((p) => p.role === "BF");
  if (!leaders.length && !guests.length) return null;
  return { source: "plan", bootsfuehrer: leaders.map((p) => p.name), bootsgaeste: guests.map((p) => p.name) };
}
