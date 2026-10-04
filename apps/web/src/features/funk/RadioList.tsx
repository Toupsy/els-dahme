import { useState } from "react";
import { correctionChain, formatClock, watchDate, watchTimeToUtc, type RadioEntry } from "@els/domain";
import { useDispatch, useLedger } from "../../core/runtime";

/** Einträge eines Tages. Korrekturen ersetzen den Eintrag in der Anzeige, das Original bleibt gespeichert. */
export function RadioList({ entries }: { entries: RadioEntry[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!entries.length) return <p className="empty card">Keine Einträge an diesem Tag.</p>;
  return (
    <ol className="radio-list" data-testid="radio-list">
      {entries.map((e) =>
        editing === e.id ? (
          <Correction key={e.id} entry={e} onDone={() => setEditing(null)} />
        ) : (
          <Row key={e.id} entry={e} onEdit={() => setEditing(e.id)} />
        ),
      )}
    </ol>
  );
}

function Row({ entry, onEdit }: { entry: RadioEntry; onEdit: () => void }) {
  const { state } = useLedger();
  const history = entry.correctionOf ? correctionChain(state.radio, entry.id).slice(0, -1) : [];
  return (
    <li className={entry.auto ? "auto" : undefined}>
      <span className="time">{formatClock(entry.at)}</span>
      <span className="calls">
        {entry.from} → {entry.to}
      </span>
      <span className="text">
        {entry.text}
        {history.length > 0 && (
          <small className="corrected" title={history.map((h) => `${formatClock(h.at)} ${h.text}`).join("\n")}>
            korrigiert, vorher: {history.at(-1)!.text} ({formatClock(history.at(-1)!.at)})
          </small>
        )}
      </span>
      <button className="btn ghost" onClick={onEdit}>
        Korrigieren
      </button>
    </li>
  );
}

function Correction({ entry, onDone }: { entry: RadioEntry; onDone: () => void }) {
  const { dispatch, error } = useDispatch();
  const [from, setFrom] = useState(entry.from);
  const [to, setTo] = useState(entry.to);
  const [time, setTime] = useState(formatClock(entry.at));
  const [text, setText] = useState(entry.text);

  async function save() {
    let at: string;
    try {
      at = watchTimeToUtc(watchDate(entry.at), time);
    } catch {
      at = entry.at;
    }
    if (await dispatch({ type: "radio.correct", data: { of: entry.id, from, to, text, at } })) onDone();
  }

  return (
    <li className="editing">
      <input aria-label="Uhrzeit" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <span className="calls">
        <input aria-label="Von" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="An" value={to} onChange={(e) => setTo(e.target.value)} />
      </span>
      <input aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} />
      <span className="row">
        <button className="btn primary" onClick={() => void save()}>
          Korrektur speichern
        </button>
        <button className="btn" onClick={onDone}>
          Abbrechen
        </button>
      </span>
      {error && <p className="error">{error}</p>}
    </li>
  );
}
