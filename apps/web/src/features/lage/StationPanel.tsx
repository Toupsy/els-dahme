import { FLAGS, FLAG_LABELS, STATIONS, type StationId } from "@els/domain";
import { useDispatch, useLedger } from "../../core/runtime";

/** Turm bzw. Hauptwache: Auf-/Abrödeln und Flagge. */
export function StationPanel({ id }: { id: StationId }) {
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const tower = state.towers[id];
  const isHq = id === "hw";

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
      {error && <p className="error">{error}</p>}
    </div>
  );
}
