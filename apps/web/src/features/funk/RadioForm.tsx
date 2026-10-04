import { useId, useRef, useState, type FormEvent } from "react";
import { RADIO_CALL_SIGNS, STANDARD_TEXTS, parseQuickRadio, watchDate, watchTimeToUtc } from "@els/domain";
import { useDispatch, useRuntime } from "../../core/runtime";
import { CallSignInput } from "./CallSignInput";

/**
 * Neuer Funkspruch: Schnelleingabe („78-1 Motor läuft, …“) oder Felder, dazu Standardtexte.
 * Von/An starten leer und springen weiter, sobald der Rufname erkannt ist („781“ → „78-1“).
 * `compact` (Panel neben der Karte): immer jetzt, ohne Uhrzeit und Textknöpfe.
 */
export function RadioForm({ date, compact = false }: { date: string; compact?: boolean }) {
  const runtime = useRuntime();
  const ids = useId();
  const { dispatch, error } = useDispatch();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [quick, setQuick] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const isToday = date === watchDate(runtime.now());
  const parsed = parseQuickRadio(quick);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

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
      setFrom("");
      setTo("");
      setText("");
      setQuick("");
      setTime("");
      fromRef.current?.focus();
    }
  }

  return (
    <form className={compact ? "radio-form compact" : "card radio-form"} onSubmit={submit}>
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
        <CallSignInput
          label="Von"
          list={`${ids}-calls`}
          inputRef={fromRef}
          value={from}
          onChange={setFrom}
          onDone={() => toRef.current?.focus()}
        />
        <CallSignInput
          label="An"
          list={`${ids}-calls`}
          inputRef={toRef}
          value={to}
          onChange={setTo}
          onDone={() => textRef.current?.focus()}
        />
        {!compact && (
          <input
            aria-label="Uhrzeit"
            type="time"
            value={time}
            required={!isToday}
            onChange={(e) => setTime(e.target.value)}
            title={isToday ? "Leer = jetzt" : "Uhrzeit des Funkspruchs"}
          />
        )}
        <input
          ref={textRef}
          aria-label="Nachricht"
          list={`${ids}-texts`}
          placeholder="Nachricht"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary big" disabled={!text.trim() || !from.trim() || !to.trim()}>
          Eintragen
        </button>
      </div>
      <datalist id={`${ids}-calls`}>
        {RADIO_CALL_SIGNS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${ids}-texts`}>
        {STANDARD_TEXTS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {!compact && (
        <div className="chips">
          {STANDARD_TEXTS.slice(0, 12).map((t) => (
            <button type="button" key={t} className="chip" onClick={() => setText(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {(timeError ?? error) && <p className="error">{timeError ?? error}</p>}
    </form>
  );
}
