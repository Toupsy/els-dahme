import "./boote.css";
import { BOAT_IDS, COAST_ORDER, STATIONS, boatStatuses, type BoatStatus, type StationId } from "@els/domain";
import { useDispatch, useLedger } from "../../core/runtime";
import { BoatActions } from "./BoatActions";

export function BootePage() {
  const { state } = useLedger();
  const boats = boatStatuses(state);
  return (
    <div className="stack">
      {BOAT_IDS.map((id) => (
        <BoatCard key={id} boat={boats[id]} />
      ))}
    </div>
  );
}

function BoatCard({ boat }: { boat: BoatStatus }) {
  return (
    <section className={boat.inService ? "card boat-card" : "card boat-card out"} data-testid={`boat-${boat.id}`}>
      <header className="boat-head">
        <h2>Boot {boat.id}</h2>
        <span className="hint">Liegeplatz {STATIONS[boat.station].label}</span>
      </header>
      <BoatActions boat={boat} />
      <BoatAdmin boat={boat} />
    </section>
  );
}

/** Verwaltung: nur hier wird ein Boot außer Dienst genommen oder der Liegeplatz korrigiert. */
function BoatAdmin({ boat }: { boat: BoatStatus }) {
  const { dispatch, error } = useDispatch();
  const busy = boat.running !== null;
  return (
    <details className="boat-admin">
      <summary>Verwaltung</summary>
      <div className="row">
        <label>
          Liegeplatz korrigieren{" "}
          <select
            value={boat.station}
            disabled={busy}
            onChange={(e) =>
              void dispatch({ type: "boat.station", data: { boat: boat.id, station: e.target.value as StationId } })
            }
          >
            {COAST_ORDER.map((id) => (
              <option key={id} value={id}>
                {STATIONS[id].label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={boat.inService ? "btn danger" : "btn"}
          disabled={busy}
          onClick={() => void dispatch({ type: "boat.service", data: { boat: boat.id, inService: !boat.inService } })}
        >
          {boat.inService ? "Außer Dienst nehmen" : "Wieder in Dienst"}
        </button>
      </div>
      {busy && <p className="hint">Während einer Fahrt gesperrt. Verlegung über „Motor läuft, Verlegung“.</p>}
      {error && <p className="error">{error}</p>}
    </details>
  );
}
