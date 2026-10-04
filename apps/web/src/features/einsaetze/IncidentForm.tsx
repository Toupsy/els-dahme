import { useState } from "react";
import { STATIONS, nearestTower, type Point } from "@els/domain";
import { useDispatch } from "../../core/runtime";

/** Neuer Einsatz an einem Ort. Titel ist mit dem nächsten Turm vorbelegt. */
export function IncidentForm({ point, onDone }: { point: Point; onDone: (id: string | null) => void }) {
  const { dispatch, error } = useDispatch();
  const [title, setTitle] = useState<string>(STATIONS[nearestTower(point)].label);
  const [note, setNote] = useState("");

  async function open() {
    const intent = await dispatch({ type: "incident.open", data: { title, note, point } });
    if (intent) onDone(intent.id);
  }

  return (
    <div className="stack-tight incident-form">
      <h2>Einsatz eröffnen</h2>
      <label>
        Titel
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <label>
        Lage / Notiz
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Was ist passiert?"
          autoFocus
        />
      </label>
      <p className="hint">
        Ort: {point.lat.toFixed(5)}, {point.lng.toFixed(5)} · vor {STATIONS[nearestTower(point)].label}
      </p>
      <div className="row">
        <button className="btn big danger" onClick={() => void open()}>
          Einsatz eröffnen
        </button>
        <button className="btn big" onClick={() => onDone(null)}>
          Abbrechen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
