import { useState, type FormEvent } from "react";
import {
  HQ_CALL_SIGN,
  RADIO_CALL_SIGNS,
  STANDARD_TEXTS,
  parseQuickRadio,
  watchDate,
  watchTimeToUtc,
} from "@els/domain";
import { useDispatch, useRuntime } from "../../core/runtime";

/** Neuer Funkspruch: Schnelleingabe („78-1 Motor läuft, …“) oder Felder, dazu Standardtexte. */
export function RadioForm({ date }: { date: string }) {
  const runtime = useRuntime();
  const { dispatch, error } = useDispatch();
  const [from, setFrom] = useState<string>(HQ_CALL_SIGN);
  const [to, setTo] = useState("Alle");
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [quick, setQuick] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const isToday = date === watchDate(runtime.now());
  const parsed = parseQuickRadio(quick);

  function applyQuick(value: string) {
    setQuick(value);
    const p = parseQuickRadio(value);
    if (p) {
      setFrom(p.from);
      setTo(p.to);
      setText(p.text);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    let at: string | undefined;
    if (time || !isToday) {
      try {
        at = watchTimeToUtc(date, time);
      } catch {
        return setTimeError("Uhrzeit als HH:MM angeben.");
      }
    }
    setTimeError(null);
    if (await dispatch({ type: "radio.append", data: { from, to, text, ...(at ? { at } : {}) } })) {
      setText("");
      setQuick("");
      setTime("");
    }
  }

  return (
    <form className="card radio-form" onSubmit={submit}>
      <input
        className="quick"
        aria-label="Schnelleingabe"
        placeholder="Schnelleingabe: 78-1 Motor läuft, Kontrollfahrt"
        value={quick}
        onChange={(e) => applyQuick(e.target.value)}
      />
      {quick && (
        <p className="quick-preview">
          {parsed ? `${parsed.from} → ${parsed.to}: ${parsed.text || "…"}` : "Rufname am Anfang nicht erkannt."}
        </p>
      )}
      <div className="radio-fields">
        <input aria-label="Von" list="callsigns" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="An" list="callsigns" value={to} onChange={(e) => setTo(e.target.value)} />
        <input
          aria-label="Uhrzeit"
          type="time"
          value={time}
          required={!isToday}
          onChange={(e) => setTime(e.target.value)}
          title={isToday ? "Leer = jetzt" : "Uhrzeit des Funkspruchs"}
        />
        <input
          aria-label="Nachricht"
          list="standard-texts"
          placeholder="Nachricht"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary big" disabled={!text.trim() || !from.trim() || !to.trim()}>
          Eintragen
        </button>
      </div>
      <datalist id="callsigns">
        {RADIO_CALL_SIGNS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="standard-texts">
        {STANDARD_TEXTS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="chips">
        {STANDARD_TEXTS.slice(0, 12).map((t) => (
          <button type="button" key={t} className="chip" onClick={() => setText(t)}>
            {t}
          </button>
        ))}
      </div>
      {(timeError ?? error) && <p className="error">{timeError ?? error}</p>}
    </form>
  );
}
