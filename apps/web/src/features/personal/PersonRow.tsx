import { COAST_ORDER, ROSTER_ROLE_LABELS, STATIONS, type DutyPerson, type StationId } from "@els/domain";
import { useDispatch } from "../../core/runtime";

/** Eine Person des Tages: anwesend/abwesend mit einem Tipp, Umsetzen per Auswahl. */
export function PersonRow({ person, date }: { person: DutyPerson; date: string }) {
  const { dispatch, error } = useDispatch();
  return (
    <li className={person.away ? "person away" : "person"}>
      <span className="name">
        {person.name}
        <small>
          {ROSTER_ROLE_LABELS[person.role]}
          {person.boat ? ` · Boot ${person.boat}` : ""}
          {person.moved ? " · umgesetzt" : ""}
        </small>
      </span>
      <select
        aria-label={`${person.name} umsetzen`}
        value={person.at}
        onChange={(e) =>
          void dispatch({
            type: "person.move",
            data: { date, person: person.id, station: e.target.value as StationId },
          })
        }
      >
        {COAST_ORDER.map((id) => (
          <option key={id} value={id}>
            {STATIONS[id].label}
          </option>
        ))}
      </select>
      <button
        className={person.away ? "btn" : "btn ghost"}
        onClick={() => void dispatch({ type: "person.away", data: { date, person: person.id, away: !person.away } })}
      >
        {person.away ? "Wieder da" : "Abwesend"}
      </button>
      {error && <p className="error">{error}</p>}
    </li>
  );
}
