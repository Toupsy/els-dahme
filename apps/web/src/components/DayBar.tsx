import { formatDate, shiftDate, watchDate } from "@els/domain";
import { useRuntime } from "../core/runtime";

/** Ein Tag zur Zeit: ‹ Datum › und „Heute“. */
export function DayBar({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const runtime = useRuntime();
  const today = watchDate(runtime.now());
  return (
    <div className="daybar">
      <button className="btn" onClick={() => onChange(shiftDate(date, -1))} aria-label="Vorheriger Tag">
        ‹
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Tag wählen"
      />
      <span className="daybar-label">{date === today ? "Heute" : formatDate(date, true)}</span>
      <button
        className="btn"
        onClick={() => onChange(shiftDate(date, 1))}
        disabled={date >= today}
        aria-label="Nächster Tag"
      >
        ›
      </button>
      {date !== today && (
        <button className="btn" onClick={() => onChange(today)}>
          Heute
        </button>
      )}
    </div>
  );
}
