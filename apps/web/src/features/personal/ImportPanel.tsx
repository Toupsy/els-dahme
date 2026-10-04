import { useState } from "react";
import {
  COAST_ORDER,
  STATIONS,
  buildRoster,
  formatDate,
  parseDelimited,
  readRosterFile,
  watchDate,
  type RosterPreview,
} from "@els/domain";
import { errorMessage } from "../../core/ledger";
import { useDispatch, useLedger, useRuntime } from "../../core/runtime";

/** Wachplan-Import: Datei wählen → Vorschau prüfen → übernehmen. Gelesen wird nur im Browser. */
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const runtime = useRuntime();
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const [year, setYear] = useState(() => Number(watchDate(runtime.now()).slice(0, 4)));
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  let preview: RosterPreview | null = null;
  let previewError: string | null = null;
  if (rows)
    try {
      preview = buildRoster(rows, year);
    } catch (e) {
      previewError = errorMessage(e);
    }

  async function load(file: File) {
    setFileName(file.name);
    setReadError(null);
    try {
      setRows(await readRosterFile(file.name, new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      setRows(null);
      setReadError(errorMessage(e));
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    for (const day of preview.days)
      if (!(await dispatch({ type: "roster.setDay", data: { date: day.date, people: day.people } }))) break;
    setBusy(false);
    onDone();
  }

  return (
    <section className="card stack-tight" data-testid="roster-import">
      <h2>Wachplan einlesen</h2>
      <p className="hint">CSV oder XLSX mit den Spalten Tag, Standort oder Code, Position, Person.</p>
      <div className="row">
        {runtime.sampleRosterCsv && (
          <button
            className="btn"
            onClick={() => {
              setFileName("Beispiel-Wachplan.csv");
              setRows(parseDelimited(runtime.sampleRosterCsv!()));
            }}
          >
            Beispiel-Wachplan laden
          </button>
        )}
        <input
          type="file"
          accept=".csv,.txt,.xlsx"
          aria-label="Wachplan-Datei"
          onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])}
        />
        <label>
          Jahr{" "}
          <input type="number" value={year} min={2020} max={2100} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
      </div>
      {(readError ?? previewError) && <p className="error">{readError ?? previewError}</p>}
      {preview && (
        <>
          <h3>
            Vorschau: {fileName} · {preview.days.length} {preview.days.length === 1 ? "Tag" : "Tage"}
          </h3>
          <table className="roster-preview">
            <thead>
              <tr>
                <th>Tag</th>
                {COAST_ORDER.map((id) => (
                  <th key={id}>{STATIONS[id].label}</th>
                ))}
                <th>Boote</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {preview.days.map((day) => (
                <tr key={day.date}>
                  <td>{formatDate(day.date, true)}</td>
                  {COAST_ORDER.map((id) => (
                    <td key={id}>{day.people.filter((p) => p.station === id).length || ""}</td>
                  ))}
                  <td>{day.people.filter((p) => p.boat).length || ""}</td>
                  <td className="hint">{state.roster[day.date] ? "ersetzt vorhandenen Plan" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.warnings.length > 0 && (
            <details open>
              <summary>{preview.warnings.length} Hinweise</summary>
              <ul className="plain warnings">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="row">
            <button className="btn big primary" disabled={busy} onClick={() => void confirm()}>
              {preview.days.length} {preview.days.length === 1 ? "Tag" : "Tage"} übernehmen
            </button>
            <button className="btn big" onClick={onDone}>
              Abbrechen
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
