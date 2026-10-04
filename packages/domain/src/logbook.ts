import { boatHours, dayTrips, type BoatHours, type DayTrip } from "./boatlog";
import { crewOf } from "./boats";
import { effectiveRadioOf } from "./radio";
import type { CrewEntry, State } from "./state";
import type { BoatId } from "./stations";

export type LogbookDay = {
  boat: BoatId;
  date: string;
  trips: DayTrip[];
  hours: BoatHours;
  crew: CrewEntry | null;
};

/** Ein Boot, ein Tag – dieselben Zahlen für Boote-Tab und Tagebuch-Blatt. */
export function logbookDay(state: State, boat: BoatId, date: string, now: number): LogbookDay {
  const entries = effectiveRadioOf(state);
  return {
    boat,
    date,
    trips: dayTrips(entries, boat, date, now),
    hours: boatHours(entries, boat, date, now, state.boats[boat].hoursBase),
    crew: crewOf(state, boat, date),
  };
}
