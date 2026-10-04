import { useEffect, useRef, useState } from "react";
import { formatClock, radioOfDay, watchDate } from "@els/domain";
import { go } from "../../core/route";
import { useLedger, useNow } from "../../core/runtime";
import { RadioForm } from "../funk/RadioForm";

const NOTE_KEY = "els-notizblock";
const LOG_LIMIT = 40;

function readNote(): string {
  try {
    return localStorage.getItem(NOTE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Panel neben der Karte: Funkspruch eintragen, Verlauf des Tages, Notizblock (wie in der Feature-App). */
export function FunkPanel() {
  const { state } = useLedger();
  const today = watchDate(useNow(60_000));
  const entries = radioOfDay(state.radio, today).slice(-LOG_LIMIT).reverse();

  return (
    <div className="funk-panel">
      <section className="funk-panel-radio">
        <div className="panel-head">
          <h2>Funktagebuch</h2>
          <button className="btn ghost" onClick={() => go("funk")}>
            Alle Einträge
          </button>
        </div>
        <RadioForm date={today} compact />
        <ol className="radio-log" data-testid="lage-radio-log">
          {entries.length === 0 && <li className="empty">Heute noch keine Einträge.</li>}
          {entries.map((e) => (
            <li key={e.id} className={e.auto ? "auto" : undefined}>
              <span className="time">{formatClock(e.at)}</span>
              <span className="calls">
                {e.from} → {e.to}
              </span>
              <span className="text">{e.text}</span>
            </li>
          ))}
        </ol>
      </section>
      <Notes />
    </div>
  );
}

/** Allgemeiner Notizblock, bewusst nur auf diesem Gerät (localStorage). */
function Notes() {
  const [text, setText] = useState(readNote);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(text);

  function flush() {
    clearTimeout(timer.current);
    try {
      localStorage.setItem(NOTE_KEY, latest.current);
    } catch {
      /* Speicher gesperrt: Notiz bleibt bis zum Neuladen erhalten */
    }
    setSaved(true);
  }

  // Auch beim Neuladen oder Schließen speichern, bevor die Verzögerung abläuft.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return (
    <section className="funk-panel-notes">
      <h2>Notizen</h2>
      <textarea
        aria-label="Notizen"
        placeholder="Notizen …"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          latest.current = e.target.value;
          setSaved(false);
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 600);
        }}
        onBlur={flush}
      />
      <p className="hint">Nur auf diesem Gerät gespeichert{saved ? "" : " …"}</p>
    </section>
  );
}
