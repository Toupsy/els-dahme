import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

const KEY = "els-lage-panel-hoehe";
const MIN_PANEL = 140;
const MIN_MAP = 160;

function read(): number | null {
  try {
    const v = Number.parseInt(localStorage.getItem(KEY) ?? "", 10);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function store(px: number | null) {
  try {
    if (px === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(px));
  } catch {
    /* Speicher gesperrt: Höhe gilt nur bis zum Neuladen */
  }
}

/** Höhe des Panels unter der Karte in px; null = Standard aus dem CSS. Wird je Gerät gemerkt. */
export function usePanelHeight() {
  return useState<number | null>(read);
}

/**
 * Trennlinie zwischen Karte und Panel: ziehen (Maus oder Finger), Pfeiltasten,
 * Doppelklick setzt auf den Standard zurück. Die Karte passt sich über ihren
 * ResizeObserver selbst an.
 */
export function Splitter({
  container,
  height,
  onChange,
}: {
  container: RefObject<HTMLElement | null>;
  height: number | null;
  onChange: (px: number | null) => void;
}) {
  const latest = useRef(height);

  function clamp(px: number) {
    const total = container.current?.clientHeight ?? 0;
    return Math.round(Math.max(MIN_PANEL, Math.min(total - MIN_MAP, px)));
  }

  function set(px: number | null) {
    latest.current = px;
    onChange(px);
  }

  function current() {
    return latest.current ?? container.current?.querySelector(".lage-panel")?.clientHeight ?? MIN_PANEL;
  }

  function start(e: PointerEvent<HTMLDivElement>) {
    const grip = e.currentTarget;
    const bottom = container.current!.getBoundingClientRect().bottom;
    grip.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => set(clamp(bottom - ev.clientY));
    const stop = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
      store(latest.current);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
    e.preventDefault();
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const px = clamp(current() + (e.key === "ArrowUp" ? 40 : -40));
    set(px);
    store(px);
  }

  return (
    <div
      className="lage-split"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Höhe von Funktagebuch und Notizen"
      tabIndex={0}
      title="Ziehen ändert die Höhe, Doppelklick setzt zurück"
      onPointerDown={start}
      onKeyDown={key}
      onDoubleClick={() => {
        set(null);
        store(null);
      }}
    />
  );
}
