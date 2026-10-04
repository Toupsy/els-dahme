import type { ReactNode } from "react";
import { applyIntent, watchDate, type AcceptedIntent } from "@els/domain";
import { Ledger, errorMessage } from "../core/ledger";
import type { Bootstrap, Runtime } from "../core/runtime";
import { demoRosterCsv, demoSeed } from "./demo-seed";

const DB_NAME = "els-demo";
const DEMO_STATUS = { kind: "demo" } as const;

/**
 * Öffentliche Vorschau: kein Server, kein Login. Der Demo-Adapter übernimmt
 * die Rolle des Servers und wendet die Outbox mit demselben Reducer an.
 * Alles bleibt in der IndexedDB dieses Browsers.
 */
export const bootstrap: Bootstrap = async () => {
  let ledger = await Ledger.open(DB_NAME);
  if (ledger.cursor === 0 && ledger.pendingIntents.length === 0) await seed(ledger);

  async function seed(target: Ledger) {
    const items: AcceptedIntent[] = demoSeed(Date.now(), target.deviceId).map((intent, i) => ({ seq: i + 1, intent }));
    await target.acceptBatch(items, items.length);
  }

  /** Bestätigt die Outbox lokal – Regel für Regel wie der Server. */
  async function confirm() {
    let state = ledger.confirmedState;
    let cursor = ledger.cursor;
    const accepted: AcceptedIntent[] = [];
    const rejected: { id: string; message: string }[] = [];
    for (const intent of ledger.pendingIntents) {
      try {
        state = applyIntent(state, intent);
        accepted.push({ seq: ++cursor, intent });
      } catch (error) {
        rejected.push({ id: intent.id, message: errorMessage(error) });
      }
    }
    await ledger.reject(rejected);
    if (accepted.length) await ledger.acceptBatch(accepted, cursor);
  }

  const runtime: Runtime = {
    mode: "demo",
    get ledger() {
      return ledger;
    },
    now: () => Date.now(),
    status: () => DEMO_STATUS,
    subscribeStatus: () => () => {},
    kick: () => void confirm(),
    sampleRosterCsv: () => demoRosterCsv(watchDate(Date.now())),
    async resetDemo() {
      await ledger.destroy();
      ledger = await Ledger.open(DB_NAME);
      await seed(ledger);
      location.reload();
    },
  };
  return { runtime, Gate: DemoGate };
};

/** Kein Login in der Demo. Der Hinweis „Demo – Daten nur lokal“ steht dauerhaft in der Kopfzeile. */
function DemoGate({ children }: { children: ReactNode }) {
  return children;
}
