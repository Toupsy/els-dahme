import "./boote.css";
import {
  BOAT_IDS,
  COAST_ORDER,
  STATIONS,
  boatStatuses,
  logbookDay,
  watchDate,
  type BoatStatus,
  type StationId,
} from "@els/domain";
import { DayBar } from "../../components/DayBar";
import { go } from "../../core/route";
import { useDispatch, useLedger, useNow, useRuntime } from "../../core/runtime";
import { BoatActions } from "./BoatActions";
import { BoatLog } from "./BoatLog";
import { LogSheet } from "./LogSheet";

/** #/boote, #/boote/<tag>, #/boote/blatt/<boot>/<tag> */
export function BootePage({ rest }: { rest: string[] }) {
  const runtime = useRuntime();
  if (rest[0] === "blatt") return <LogSheet boat={rest[1] ?? ""} date={rest[2] ?? ""} />;
  const date = rest[0] && /^\d{4}-\d{2}-\d{2}$/.test(rest[0]) ? rest[0] : watchDate(runtime.now());
  return <BoatList date={date} />;
}

function BoatList({ date }: { date: string }) {
  const { state } = useLedger();
  const boats = boatStatuses(state);
  return (
    <div className="stack">
      <DayBar date={date} onChange={(d) => go("boote", d)} />
      {BOAT_IDS.map((id) => (
        <BoatCard key={id} boat={boats[id]} date={date} />
      ))}
    </div>
  );
}

function BoatCard({ boat, date }: { boat: BoatStatus; date: string }) {
  const { state } = useLedger();
  const now = useNow(15_000);
  const log = logbookDay(state, boat.id, date, now);
  return (
    <section className={boat.inService ? "card boat-card" : "card boat-card out"} data-testid={`boat-${boat.id}`}>
      <header className="boat-head">
        <h2>Boot {boat.id}</h2>
        <span className="hint">Liegeplatz {STATIONS[boat.station].label}</span>
      </header>
      <BoatActions boat={boat} />
      <BoatLog log={log} />
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
