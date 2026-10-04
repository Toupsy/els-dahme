import {
  DomainError,
  applyIntent,
  initialState,
  parseIntent,
  replay,
  toIso,
  type AcceptedIntent,
  type Intent,
  type IntentInput,
  type IntentType,
  type State,
} from "@els/domain";
import { deleteDb, done, openDb, request } from "./idb";

export type Rejection = { intent: Intent; message: string };
export type OutboxItem = { order?: number; intent: Intent };

export type LedgerSnapshot = {
  /** Bestätigter Stand plus alle noch nicht bestätigten eigenen Aktionen. */
  state: State;
  pending: number;
  rejected: Rejection[];
};

/**
 * Lokaler Speicher eines Geräts.
 *   log      – vom Server (bzw. Demo-Adapter) angenommene Aktionen, nach seq
 *   outbox   – eigene Aktionen, die noch nicht bestätigt sind
 *   rejected – abgewiesene Aktionen, damit die Bedienung sie sieht
 * Der angezeigte Zustand ist der bestätigte Stand, auf den die Outbox erneut
 * angewendet wird. Es gibt keinen zweiten Schreibweg.
 */
export class Ledger {
  private db!: IDBDatabase;
  private confirmed: State = initialState();
  private outbox: OutboxItem[] = [];
  private rejectedList: Rejection[] = [];
  private snapshot!: LedgerSnapshot;
  private listeners = new Set<() => void>();
  private channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("els-ledger") : null;
  deviceId = "";
  cursor = 0;

  private constructor(
    readonly name: string,
    private readonly now: () => number,
  ) {}

  static async open(name: string, now: () => number = Date.now): Promise<Ledger> {
    const ledger = new Ledger(name, now);
    ledger.db = await openDb(name);
    await ledger.load();
    if (ledger.channel) ledger.channel.onmessage = () => void ledger.load();
    return ledger;
  }

  private async load() {
    const tx = this.db.transaction(["meta", "log", "outbox", "rejected"], "readwrite");
    const meta = tx.objectStore("meta");
    let deviceId = (await request(meta.get("deviceId"))) as string | undefined;
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      meta.put(deviceId, "deviceId");
    }
    this.deviceId = deviceId;
    this.cursor = ((await request(meta.get("cursor"))) as number | undefined) ?? 0;
    const log = (await request(tx.objectStore("log").getAll())) as AcceptedIntent[];
    this.outbox = (await request(tx.objectStore("outbox").getAll())) as OutboxItem[];
    this.rejectedList = (await request(tx.objectStore("rejected").getAll())) as Rejection[];
    await done(tx);
    this.confirmed = replay(log.map((l) => l.intent)).state;
    this.refresh();
  }

  private refresh() {
    let state = this.confirmed;
    for (const item of this.outbox) {
      try {
        state = applyIntent(state, item.intent);
      } catch {
        // Passt nach neuem Serverstand nicht mehr; der Server entscheidet beim Senden.
      }
    }
    this.snapshot = { state, pending: this.outbox.length, rejected: this.rejectedList };
    for (const listener of this.listeners) listener();
  }

  private broadcast() {
    this.channel?.postMessage("changed");
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LedgerSnapshot => this.snapshot;

  get confirmedState(): State {
    return this.confirmed;
  }

  get pendingIntents(): Intent[] {
    return this.outbox.map((o) => o.intent);
  }

  /** Erzeugt eine Aktion, prüft sie gegen den aktuellen Stand und legt sie in die Outbox. */
  async dispatch<T extends IntentType>(input: IntentInput<T>): Promise<Intent> {
    const intent = parseIntent({
      id: crypto.randomUUID(),
      deviceId: this.deviceId,
      createdAt: toIso(this.now()),
      type: input.type,
      data: input.data,
    });
    applyIntent(this.snapshot.state, intent); // wirft DomainError mit verständlicher Meldung
    const tx = this.db.transaction("outbox", "readwrite");
    const order = await request(tx.objectStore("outbox").add({ intent }));
    await done(tx);
    this.outbox.push({ order: order as number, intent });
    this.refresh();
    this.broadcast();
    return intent;
  }

  /** Übernimmt angenommene Aktionen und entfernt bestätigte eigene Aktionen aus der Outbox – atomar. */
  async acceptBatch(items: AcceptedIntent[], cursor: number) {
    const tx = this.db.transaction(["meta", "log", "outbox"], "readwrite");
    const log = tx.objectStore("log");
    const outbox = tx.objectStore("outbox");
    const ids = new Set(items.map((i) => i.intent.id));
    for (const item of items) log.put(item);
    for (const pending of this.outbox)
      if (ids.has(pending.intent.id) && pending.order !== undefined) outbox.delete(pending.order);
    tx.objectStore("meta").put(cursor, "cursor");
    await done(tx);
    this.confirmed = replay(
      items.map((i) => i.intent),
      this.confirmed,
    ).state;
    this.outbox = this.outbox.filter((o) => !ids.has(o.intent.id));
    this.cursor = cursor;
    this.refresh();
    this.broadcast();
  }

  /** Vom Server abgewiesene Aktionen verlassen die Outbox und werden sichtbar gemeldet. */
  async reject(rejections: { id: string; message: string }[]) {
    if (!rejections.length) return;
    const byId = new Map(rejections.map((r) => [r.id, r.message]));
    const tx = this.db.transaction(["outbox", "rejected"], "readwrite");
    for (const pending of this.outbox) {
      const message = byId.get(pending.intent.id);
      if (message === undefined) continue;
      if (pending.order !== undefined) tx.objectStore("outbox").delete(pending.order);
      tx.objectStore("rejected").put({ intent: pending.intent, message });
    }
    await done(tx);
    this.rejectedList = [
      ...this.rejectedList,
      ...this.outbox
        .filter((o) => byId.has(o.intent.id))
        .map((o) => ({ intent: o.intent, message: byId.get(o.intent.id)! })),
    ];
    this.outbox = this.outbox.filter((o) => !byId.has(o.intent.id));
    this.refresh();
    this.broadcast();
  }

  async clearRejected() {
    const tx = this.db.transaction("rejected", "readwrite");
    tx.objectStore("rejected").clear();
    await done(tx);
    this.rejectedList = [];
    this.refresh();
  }

  /** Vollständiger Abgleich: bestätigter Stand wird verworfen, die Outbox bleibt. */
  async resetConfirmed() {
    const tx = this.db.transaction(["meta", "log"], "readwrite");
    tx.objectStore("log").clear();
    tx.objectStore("meta").put(0, "cursor");
    await done(tx);
    this.confirmed = initialState();
    this.cursor = 0;
    this.refresh();
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction("meta", "readonly");
    return (await request(tx.objectStore("meta").get(key))) as T | undefined;
  }

  async setMeta(key: string, value: unknown) {
    const tx = this.db.transaction("meta", "readwrite");
    if (value === undefined) tx.objectStore("meta").delete(key);
    else tx.objectStore("meta").put(value, key);
    await done(tx);
  }

  /** Löscht alle lokalen Daten dieses Geräts (nur Demo). */
  async destroy() {
    this.channel?.close();
    this.db.close();
    await deleteDb(this.name);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unbekannter Fehler.";
}
