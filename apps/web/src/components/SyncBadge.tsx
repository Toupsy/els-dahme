import { useLedger, useRuntime, useSyncStatus } from "../core/runtime";

/** Unaufdringliche Anzeige des Sync-Stands. Antippen stößt einen Abgleich an. */
export function SyncBadge() {
  const status = useSyncStatus();
  const { pending, rejected } = useLedger();
  const runtime = useRuntime();
  if (status.kind === "demo") return null;

  const text = {
    synced: "Synchron",
    syncing: "Abgleich …",
    pending: pending ? `${pending} ausstehend` : "Synchron",
    offline: pending ? `Offline · ${pending} ausstehend` : "Offline",
    login: "Anmeldung nötig",
    error: "Sync-Fehler",
  }[status.kind];
  const tone =
    status.kind === "synced" || (status.kind === "pending" && !pending)
      ? "ok"
      : status.kind === "error"
        ? "bad"
        : "wait";

  return (
    <button
      className={`sync-badge ${tone}`}
      onClick={runtime.kick}
      title={status.kind === "error" ? status.message : "Jetzt abgleichen"}
      data-testid="sync-badge"
      data-state={status.kind === "pending" && !pending ? "synced" : status.kind}
    >
      <span className="dot" />
      {text}
      {rejected.length > 0 && <span className="rejected-count"> · {rejected.length} abgewiesen</span>}
    </button>
  );
}
