import { FLAGS, FLAG_LABELS, STATIONS, occupancy, watchDate, type StationId } from "@els/domain";
import "../personal/personal.css";
import { useDispatch, useLedger, useNow } from "../../core/runtime";
import { PersonRow } from "../personal/PersonRow";

/** Turm bzw. Hauptwache: Auf-/Abrödeln und Flagge. */
export function StationPanel({ id }: { id: StationId }) {
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const tower = state.towers[id];
  const isHq = id === "hw";
  const today = watchDate(useNow(60_000));
  const present = occupancy(state, today)[id];

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
      <h3>Besetzung ({present.length})</h3>
      {present.length === 0 && <p className="empty">Laut Wachplan niemand anwesend.</p>}
      <ul className="plain">
        {present.map((p) => (
          <PersonRow key={p.id} person={p} date={today} />
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
