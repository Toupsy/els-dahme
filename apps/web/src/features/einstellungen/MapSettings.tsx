import { useState } from "react";
import { MAP_DEFAULTS } from "@els/domain";
import { useDispatch, useLedger } from "../../core/runtime";
import { preloadTiles, revierTiles } from "../lage/tiles";

/** Kartendrehung (für alle Geräte) und Kacheln für den Offline-Betrieb (nur dieses Gerät). */
export function MapSettings() {
  const { state } = useLedger();
  const { dispatch, error } = useDispatch();
  const [bearing, setBearing] = useState(state.settings.mapBearing);
  const [progress, setProgress] = useState<{ done: number; total: number; failed?: number } | null>(null);

  async function preload() {
    setProgress({ done: 0, total: revierTiles().length });
    const failed = await preloadTiles((done, total) => setProgress({ done, total }));
    setProgress((p) => (p ? { ...p, failed } : p));
  }

  return (
    <section className="card stack-tight">
      <h2>Karte</h2>
      <label htmlFor="bearing">Drehung (Seeseite oben = {MAP_DEFAULTS.bearing}°)</label>
      <div className="row">
        <input
          id="bearing"
          type="range"
          min={0}
          max={359}
          value={bearing}
          onChange={(e) => setBearing(Number(e.target.value))}
        />
        <span>{bearing}°</span>
        <button
          className="btn"
          disabled={bearing === state.settings.mapBearing}
          onClick={() => void dispatch({ type: "settings.update", data: { mapBearing: bearing } })}
        >
          Übernehmen
        </button>
        <button className="btn" onClick={() => setBearing(MAP_DEFAULTS.bearing)}>
          Standard
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <h3>Offline-Karte</h3>
      <p className="hint">
        Angesehene Kacheln bleiben automatisch gespeichert. „Revier vorladen“ holt einmalig etwa {revierTiles().length}{" "}
        Kacheln (Zoom 13–17) für dieses Gerät.
      </p>
      <div className="row">
        <button
          className="btn"
          onClick={() => void preload()}
          disabled={!!progress && !progress.failed && progress.done < progress.total}
        >
          Revier vorladen
        </button>
        {progress && (
          <span className="hint">
            {progress.done} / {progress.total}
            {progress.failed !== undefined && (progress.failed ? ` · ${progress.failed} fehlgeschlagen` : " · fertig")}
          </span>
        )}
      </div>
    </section>
  );
}
