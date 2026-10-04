import { useEffect, useRef, type ReactNode } from "react";

/**
 * Popup über der Karte (natives <dialog>): Esc, ✕ oder Tippen neben das
 * Fenster schließen es.
 */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="popup"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="popup-body">
        <button className="btn close" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
        {children}
      </div>
    </dialog>
  );
}
