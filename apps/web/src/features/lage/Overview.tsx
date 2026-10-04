import {
  BOAT_IDS,
  STATIONS,
  TOWER_IDS,
  activeIncidents,
  boatStatuses,
  formatClock,
  formatRuntime,
  parseTs,
  roundMinutes,
} from "@els/domain";
import { useLedger, useNow } from "../../core/runtime";
import type { Selection } from "./LagePage";

/** Panel ohne Auswahl: laufende Einsätze und Fahrten, besetzte Türme. */
export function Overview({ onSelect }: { onSelect: (s: Selection) => void }) {
  const { state } = useLedger();
  const now = useNow(10_000);
  const boats = boatStatuses(state);
  const open = TOWER_IDS.filter((id) => state.towers[id].open);
  const running = BOAT_IDS.map((id) => boats[id]).filter((b) => b.running);
  const incidents = activeIncidents(state);

  return (
    <div className="stack-tight">
      <h2>Lage</h2>
      <p className="hint">Turm, Boot oder Einsatz antippen. Langes Drücken auf die Karte eröffnet einen Einsatz.</p>
      {incidents.length > 0 && <h3>Einsätze</h3>}
      {incidents.map((i) => (
        <button key={i.id} className="list-button incident" onClick={() => onSelect({ kind: "incident", id: i.id })}>
          <b>E{i.number}</b> {i.title}
          <span>seit {formatClock(i.openedAt)}</span>
        </button>
      ))}
      <h3>Boote unterwegs</h3>
      {running.length === 0 && <p className="empty">Keine Fahrt.</p>}
      {running.map((b) => (
        <button key={b.id} className="list-button running" onClick={() => onSelect({ kind: "boat", id: b.id })}>
          <b>{b.id}</b> {b.running!.purpose}
          {b.running!.target ? ` nach ${STATIONS[b.running!.target].label}` : ""}
          <span>{formatRuntime(roundMinutes(now - parseTs(b.running!.since)))}</span>
        </button>
      ))}
      <h3>Türme</h3>
      <p>{open.length ? `Besetzt: ${open.map((id) => STATIONS[id].label).join(", ")}` : "Kein Turm besetzt."}</p>
    </div>
  );
}
