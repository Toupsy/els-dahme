import { createHash } from "node:crypto";
import {
  DomainError,
  PULL_LIMIT,
  applyIntent,
  canonicalJson,
  intentSchema,
  parseIntent,
  replay,
  type Intent,
  type PullResponse,
  type State,
} from "@els/domain";
import type { Db } from "./db";

export type Acknowledgement = { id: string; seq: number; duplicate: boolean };

/**
 * Schreibender Kern des Servers. Der Zustand entsteht beim Start aus allen
 * angenommenen Aktionen (derselbe Reducer wie im Browser) und wird nur im
 * Speicher gehalten. Jede neue Aktion wird in einer IMMEDIATE-Transaktion
 * gespeichert; erst nach dem Commit gilt der neue Zustand.
 */
export function createLedger(db: Db, log: (message: string) => void = () => {}) {
  const rows = db.prepare("SELECT seq, body FROM intents ORDER BY seq").all() as { seq: number; body: string }[];
  const initial = replay(rows.map((r) => intentSchema.parse(JSON.parse(r.body))));
  for (const { intent, error } of initial.rejected)
    log(`Aktion ${intent.id} (${intent.type}) lässt sich nicht mehr anwenden: ${error.message}`);
  let state: State = initial.state;

  const findReceipt = db.prepare("SELECT seq, fingerprint FROM intents WHERE id = ?");
  const insertIntent = db.prepare(
    "INSERT INTO intents(id, device_id, type, created_at, received_at, body, fingerprint) VALUES(?,?,?,?,?,?,?)",
  );
  const insertRadio = db.prepare(
    "INSERT INTO radio_entries(id, intent_seq, at, sender, recipient, text, correction_of, auto) VALUES(?,?,?,?,?,?,?,?)",
  );
  const selectPage = db.prepare("SELECT seq, body FROM intents WHERE seq > ? ORDER BY seq LIMIT ?");
  const selectHead = db.prepare("SELECT COALESCE(MAX(seq), 0) AS head FROM intents");

  const store = db.transaction((intent: Intent, body: string, fingerprint: string, next: State) => {
    const { lastInsertRowid } = insertIntent.run(
      intent.id,
      intent.deviceId,
      intent.type,
      intent.createdAt,
      new Date().toISOString(),
      body,
      fingerprint,
    );
    const seq = Number(lastInsertRowid);
    for (const entry of next.radio.slice(state.radio.length))
      insertRadio.run(
        entry.id,
        seq,
        entry.at,
        entry.from,
        entry.to,
        entry.text,
        entry.correctionOf,
        entry.auto ? 1 : 0,
      );
    return seq;
  });

  return {
    get state() {
      return state;
    },

    /** Idempotent: dieselbe Aktion erneut → frühere Quittung; gleiche ID mit anderem Inhalt → CONFLICT. */
    apply(input: unknown): Acknowledgement {
      const intent = parseIntent(input);
      const body = canonicalJson(intent);
      const fingerprint = createHash("sha256").update(body).digest("hex");
      const receipt = findReceipt.get(intent.id) as { seq: number; fingerprint: string } | undefined;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new DomainError("CONFLICT", "Aktions-ID wurde bereits mit anderem Inhalt verwendet.");
        return { id: intent.id, seq: receipt.seq, duplicate: true };
      }
      const next = applyIntent(state, intent);
      const seq = store.immediate(intent, body, fingerprint, next);
      state = next;
      return { id: intent.id, seq, duplicate: false };
    },

    /** Ein Cursor hinter dem Serverstand (z. B. nach einer Wiederherstellung) verlangt einen vollständigen Abgleich. */
    pull(since: number, limit = PULL_LIMIT): PullResponse {
      const { head } = selectHead.get() as { head: number };
      if (since > head)
        throw new DomainError("CONFLICT", "Serverstand ist älter als der Gerätestand. Vollständiger Abgleich nötig.");
      const size = Math.max(1, Math.min(limit, PULL_LIMIT));
      const page = selectPage.all(since, size + 1) as { seq: number; body: string }[];
      const hasMore = page.length > size;
      const items = page.slice(0, size).map((r) => ({ seq: r.seq, intent: intentSchema.parse(JSON.parse(r.body)) }));
      return { intents: items, cursor: items.at(-1)?.seq ?? since, hasMore };
    },
  };
}

export type Ledger = ReturnType<typeof createLedger>;
