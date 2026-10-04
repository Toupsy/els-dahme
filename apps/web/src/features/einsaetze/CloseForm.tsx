import { useState } from "react";
import { INCIDENT_KINDS, INCIDENT_OUTCOMES, type Incident, type IncidentHead } from "@els/domain";
import { useDispatch } from "../../core/runtime";

/** Abschluss mit den Kopfdaten des Einsatzprotokolls. */
export function CloseForm({ incident, onCancel }: { incident: Incident; onCancel: () => void }) {
  const { dispatch, error } = useDispatch();
  const [head, setHead] = useState<IncidentHead>({
    kind: "Schwimmer in Not",
    outcome: "Erledigt",
    persons: 1,
    remark: "",
  });
  const set = (patch: Partial<IncidentHead>) => setHead({ ...head, ...patch });
  const boatsRunning = incident.resources.some((r) => r.kind === "boat" && !r.releasedAt);

  return (
    <div className="inline-form close-form">
      <label>
        Einsatzart
        <select value={head.kind} onChange={(e) => set({ kind: e.target.value as IncidentHead["kind"] })}>
          {INCIDENT_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Ergebnis
        <select value={head.outcome} onChange={(e) => set({ outcome: e.target.value as IncidentHead["outcome"] })}>
          {INCIDENT_OUTCOMES.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        Betroffene Personen
        <input
          type="number"
          min={0}
          max={99}
          value={head.persons}
          onChange={(e) => set({ persons: Math.max(0, Number(e.target.value) || 0) })}
        />
      </label>
      <label className="wide">
        Bemerkung
        <input value={head.remark} onChange={(e) => set({ remark: e.target.value })} />
      </label>
      {boatsRunning && <p className="hint">Zugeordnete Boote fahren weiter, bis sie „Motor aus“ melden.</p>}
      <div className="row">
        <button
          className="btn big danger"
          onClick={() => void dispatch({ type: "incident.close", data: { incident: incident.id, head } })}
        >
          Einsatz abschließen
        </button>
        <button className="btn big" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
