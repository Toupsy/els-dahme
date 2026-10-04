import { useState } from "react";
import {
  INCIDENT_EVENTS,
  formatClock,
  formatRuntime,
  parseTs,
  resourceLabel,
  roundMinutes,
  type Incident,
  type Resource,
} from "@els/domain";
import { useDispatch, useNow } from "../../core/runtime";
import { AssignBar } from "./AssignBar";
import { CloseForm } from "./CloseForm";

/** Ein Einsatz: Kräfte mit Lagemeldungen, Zuordnen, Notiz, Zeitachse, Abschluss. */
export function IncidentDetail({ incident }: { incident: Incident }) {
  const now = useNow(15_000);
  const { dispatch, error } = useDispatch();
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const active = incident.resources.filter((r) => !r.releasedAt);
  const end = incident.closedAt ? parseTs(incident.closedAt) : now;

  async function addNote() {
    if (await dispatch({ type: "incident.note", data: { incident: incident.id, text: note } })) setNote("");
  }

  return (
    <div className="stack-tight incident" data-testid={`incident-${incident.number}`}>
      <header>
        <h2>
          Einsatz {incident.number}: {incident.title}
        </h2>
        <p className="hint">
          Eröffnet {formatClock(incident.openedAt)} ·{" "}
          {incident.closedAt ? `beendet ${formatClock(incident.closedAt)} · ` : ""}
          Dauer {formatRuntime(roundMinutes(end - parseTs(incident.openedAt)))}
        </p>
        {incident.note && <p>{incident.note}</p>}
        {incident.head && (
          <p className="head">
            {incident.head.kind} · {incident.head.outcome} · {incident.head.persons} Betroffene
            {incident.head.remark ? ` · ${incident.head.remark}` : ""}
          </p>
        )}
      </header>

      {!incident.closedAt && (
        <>
          <h3>Im Einsatz</h3>
          {active.length === 0 && <p className="empty">Noch keine Kräfte zugeordnet.</p>}
          {active.map((r) => (
            <ResourceRow key={r.id} incident={incident} resource={r} />
          ))}
          <AssignBar incident={incident} />
          <div className="row">
            <input
              className="grow"
              aria-label="Notiz zum Einsatz"
              placeholder="Notiz, z. B. RTW angefordert"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn" disabled={!note.trim()} onClick={() => void addNote()}>
              Notiz
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      <details open={!incident.closedAt}>
        <summary>Zeitachse ({incident.timeline.length})</summary>
        <ol className="timeline">
          {incident.timeline.map((t, i) => (
            <li key={i}>
              <span className="time">{formatClock(t.at)}</span> {t.text}
            </li>
          ))}
        </ol>
      </details>

      {!incident.closedAt &&
        (closing ? (
          <CloseForm incident={incident} onCancel={() => setClosing(false)} />
        ) : (
          <button className="btn big wide" onClick={() => setClosing(true)}>
            Einsatz abschließen …
          </button>
        ))}
    </div>
  );
}

function ResourceRow({ incident, resource }: { incident: Incident; resource: Resource }) {
  const { dispatch, error } = useDispatch();
  const reported = new Set(
    incident.timeline.filter((t) => t.text.startsWith(`${resourceLabel(resource)}: `)).map((t) => t.text),
  );
  const events = resource.kind === "team" ? INCIDENT_EVENTS.filter((e) => e !== "Person aufgenommen") : INCIDENT_EVENTS;
  return (
    <div className="resource">
      <b>{resourceLabel(resource)}</b>
      <span className="hint">seit {formatClock(resource.assignedAt)}</span>
      <div className="row">
        {events.map((event) => (
          <button
            key={event}
            className="btn"
            disabled={reported.has(`${resourceLabel(resource)}: ${event}`)}
            onClick={() =>
              void dispatch({ type: "incident.event", data: { incident: incident.id, resource: resource.id, event } })
            }
          >
            {event}
          </button>
        ))}
        <button
          className="btn ghost"
          onClick={() =>
            void dispatch({ type: "incident.release", data: { incident: incident.id, resource: resource.id } })
          }
        >
          Entlassen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
