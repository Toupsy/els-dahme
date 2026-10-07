import {
  FLAGS,
  FLAG_LABELS,
  ROSTER_ROLE_LABELS,
  STATIONS,
  occupancy,
  stationStrength,
  watchDate,
  type StationId,
} from "@els/domain";
import { useDispatch, useLedger, useNow } from "../../core/runtime";

/** Turm bzw. Hauptwache: Auf-/Abrödeln, Flagge und „−1“, wenn eine Person fehlt. */
export function StationPanel({ id }: { id: StationId }) {
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const tower = state.towers[id];
  const isHq = id === "hw";
  const today = watchDate(useNow(60_000));
  const present = occupancy(state, today)[id];
  const { count, short } = stationStrength(state, today)[id];

  return (
    <div className="stack-tight">
      <h2>{isHq ? "Hauptwache" : `Turm ${STATIONS[id].label}`}</h2>
      {!isHq && (
        <p className={tower.open ? "status-line ok" : "status-line"}>
          {tower.open ? "Aufgerödelt, E-klar" : "Nicht besetzt"}
        </p>
      )}
      {!isHq &&
        (tower.open ? (
          <button
            className="btn big wide"
            onClick={() => void dispatch({ type: "tower.rigDown", data: { station: id } })}
          >
            Abrödeln
          </button>
        ) : (
          <button
            className="btn big run wide"
            onClick={() => void dispatch({ type: "tower.rigUp", data: { station: id } })}
          >
            Aufrödeln
          </button>
        ))}
      {tower.open && (
        <>
          <h3>Flagge</h3>
          <div className="grid-buttons">
            {FLAGS.map((flag) => (
              <button
                key={flag}
                className={tower.flag === flag ? "btn big selected" : "btn big"}
                aria-pressed={tower.flag === flag}
                onClick={() => void dispatch({ type: "tower.flag", data: { station: id, flag } })}
                disabled={tower.flag === flag}
              >
                {flag ? FLAG_LABELS[flag] : "Einholen"}
              </button>
            ))}
          </div>
        </>
      )}
      <h3>
        Besetzung ({count}
        {short && ` von ${present.length}`})
      </h3>
      {short && <p className="status-line short">Eine Person weniger besetzt</p>}
      {(present.length > 0 || short) && (
        <button
          className={short ? "btn big wide" : "btn big wide short"}
          aria-pressed={short}
          onClick={() => void dispatch({ type: "station.short", data: { date: today, station: id, short: !short } })}
        >
          {short ? "Wieder vollzählig" : "−1 Person"}
        </button>
      )}
      {present.length === 0 && <p className="empty">Laut Wachplan niemand anwesend.</p>}
      <ul className="plain names">
        {present.map((p) => (
          <li key={p.id}>
            {p.name} <small>{ROSTER_ROLE_LABELS[p.role]}</small>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
