import { formatDate, formatHours, isBoatId, logbookDay } from "@els/domain";
import { go } from "../../core/route";
import { useLedger, useNow } from "../../core/runtime";
import { TripTable } from "./BoatLog";

/**
 * Tagebuch-Blatt: ein Boot, ein Tag – im Aufbau des DLRG-Bootstagebuchs.
 * Zum Abschreiben ins Papierbuch oder Ausdrucken und Unterschreiben.
 */
export function LogSheet({ boat, date }: { boat: string; date: string }) {
  const { state } = useLedger();
  const now = useNow(30_000);
  if (!isBoatId(boat) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return <p className="error">Blatt nicht gefunden.</p>;
  const log = logbookDay(state, boat, date, now);

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn big" onClick={() => go("boote", date)}>
          Zurück
        </button>
        <button className="btn big primary" onClick={() => window.print()}>
          Drucken
        </button>
      </div>
      <article className="log-sheet" data-testid="log-sheet">
        <header>
          <h1>Bootstagebuch in der DLRG – Einsatzfahrten</h1>
          <p>
            Boot {boat} · {formatDate(date, true)}
          </p>
        </header>
        <TripTable trips={log.trips} rows={6} />
        <section className="sheet-hours">
          <h2>Betriebsstunden</h2>
          <dl>
            <dt>Einsatztag:</dt>
            <dd>{formatHours(log.hours.dayMin)}</dd>
            <dt>Übertrag:</dt>
            <dd>{formatHours(log.hours.carryMin)}</dd>
            <dt className="sum">Gesamt:</dt>
            <dd className="sum">{formatHours(log.hours.totalMin)}</dd>
          </dl>
        </section>
        <section className="sheet-signs">
          <h2>Unterschriften</h2>
          <div className="sign">
            <span>{log.crew?.bootsfuehrer ?? ""}</span>Bootsführer
          </div>
          <div className="sign">
            <span />
            Wachführer
          </div>
          <div className="sign">
            <span />
            TL / LE
          </div>
        </section>
      </article>
    </div>
  );
}
