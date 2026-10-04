import "./funk.css";
import { useState, type FormEvent } from "react";
import { HQ_CALL_SIGN, formatClock, radioOfDay, watchDate } from "@els/domain";
import { DayBar } from "../../components/DayBar";
import { useDispatch, useLedger, useRuntime } from "../../core/runtime";

export function FunkPage() {
  const runtime = useRuntime();
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const [date, setDate] = useState(() => watchDate(runtime.now()));
  const [from, setFrom] = useState(HQ_CALL_SIGN);
  const [to, setTo] = useState("Alle");
  const [text, setText] = useState("");
  const entries = radioOfDay(state.radio, date);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await dispatch({ type: "radio.append", data: { from, to, text } })) setText("");
  }

  return (
    <div className="stack">
      <DayBar date={date} onChange={setDate} />
      <form className="card radio-form" onSubmit={submit}>
        <input aria-label="Von" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="An" value={to} onChange={(e) => setTo(e.target.value)} />
        <input aria-label="Nachricht" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht" />
        <button className="btn primary" disabled={!text.trim()}>
          Eintragen
        </button>
        {error && <p className="error">{error}</p>}
      </form>
      <ol className="radio-list">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="time">{formatClock(e.at)}</span>
            <span className="calls">
              {e.from} → {e.to}
            </span>
            <span className="text">{e.text}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="empty">Keine Einträge an diesem Tag.</li>}
      </ol>
    </div>
  );
}
