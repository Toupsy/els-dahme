import { fail } from "./errors";
import { AUTO, classifyMotorMessage, splitReason, stopStation } from "./funk";
import type { IntentOf } from "./intents";
import { appendRadio, effectiveRadio } from "./radio";
import type { RadioEntry, State } from "./state";
import { BOAT_IDS, DEFAULT_BOAT_HOMES, HQ_CALL_SIGN, STATIONS, type BoatId, type StationId } from "./stations";
import { dayStart, parseTs, toIso } from "./time";

export type RunningTrip = {
  since: string;
  /** Beginn des aktuellen Abschnitts (Fahrtwechsel). */
  legSince: string;
  purpose: string;
  target: StationId | null;
};

export type BoatStatus = {
  id: BoatId;
  /** Liegeplatz; bei laufender Fahrt der Ausgangspunkt. */
  station: StationId;
  inService: boolean;
  running: RunningTrip | null;
};

/**
 * Status eines Boots, berechnet aus den gültigen Funksprüchen des Boots und
 * den Verwaltungs-Korrekturen. Nichts davon wird gespeichert.
 */
export function deriveBoat(state: State, id: BoatId, effective?: readonly RadioEntry[]): BoatStatus {
  const facts = state.boats[id];
  const events: { t: number; order: number; apply: () => void }[] = [];
  let station: StationId = DEFAULT_BOAT_HOMES[id];
  let running: RunningTrip | null = null;
  (effective ?? effectiveRadio(state.radio)).forEach((entry, order) => {
    if (entry.from !== id) return;
    const message = classifyMotorMessage(entry.text);
    if (message.kind === "none") return;
    events.push({
      t: parseTs(entry.at),
      order,
      apply: () => {
        if (message.kind === "stop") {
          if (!running) return;
          station = stopStation(entry.text) ?? station;
          running = null;
          return;
        }
        const { purpose, target } = splitReason(message.reason);
        if (running) running = { ...running, legSince: entry.at, purpose, target };
        else if (message.kind === "start") running = { since: entry.at, legSince: entry.at, purpose, target };
      },
    });
  });
  facts.moves.forEach((move, i) =>
    events.push({
      t: parseTs(move.at),
      order: Number.MAX_SAFE_INTEGER - facts.moves.length + i,
      apply: () => {
        if (!running) station = move.station;
      },
    }),
  );
  events.sort((a, b) => a.t - b.t || a.order - b.order).forEach((e) => e.apply());
  return { id, station, inService: facts.inService, running };
}

const cache = new WeakMap<State, Record<BoatId, BoatStatus>>();

/** Alle Boote; je Zustand nur einmal berechnet (für die Oberfläche). */
export function boatStatuses(state: State): Record<BoatId, BoatStatus> {
  let result = cache.get(state);
  if (!result) {
    const effective = effectiveRadio(state.radio);
    result = Object.fromEntries(BOAT_IDS.map((id) => [id, deriveBoat(state, id, effective)])) as Record<
      BoatId,
      BoatStatus
    >;
    cache.set(state, result);
  }
  return result;
}

function radioOf(draft: State, intentId: string, at: string, boat: BoatId, text: string) {
  appendRadio(draft, intentId, 0, { from: boat, to: HQ_CALL_SIGN, text, at }, true);
}

/* ── Fachregeln der Boots-Aktionen ───────────────────────────────────────── */

export function motorOn(draft: State, intent: IntentOf<"boat.motorOn">) {
  const { boat, purpose, target } = intent.data;
  const status = deriveBoat(draft, boat);
  if (!status.inService) fail("INVALID_TRANSITION", `${boat} ist außer Dienst.`);
  if (status.running) fail("INVALID_TRANSITION", `${boat}: Motor läuft bereits.`);
  if (purpose === "Verlegungsfahrt" && !target) fail("INVALID_INPUT", "Verlegungsfahrt braucht ein Ziel.");
  if (target && target === status.station) fail("INVALID_INPUT", `${boat} liegt bereits an ${STATIONS[target].label}.`);
  radioOf(draft, intent.id, intent.createdAt, boat, AUTO.motorOn(purpose, target));
}

export function switchTrip(draft: State, intent: IntentOf<"boat.switch">) {
  const { boat, purpose, target } = intent.data;
  const status = deriveBoat(draft, boat);
  if (!status.running) fail("INVALID_TRANSITION", `${boat}: Motor ist aus.`);
  if (purpose === "Verlegungsfahrt" && !target) fail("INVALID_INPUT", "Verlegungsfahrt braucht ein Ziel.");
  if (status.running.purpose === purpose && status.running.target === target)
    fail("INVALID_TRANSITION", `${boat} fährt bereits ${purpose}.`);
  radioOf(draft, intent.id, intent.createdAt, boat, AUTO.switchTo(status.running.purpose, purpose, target));
}

export function motorOff(draft: State, intent: IntentOf<"boat.motorOff">) {
  const { boat } = intent.data;
  const status = deriveBoat(draft, boat);
  if (!status.running) fail("INVALID_TRANSITION", `${boat}: Motor ist bereits aus.`);
  const station = intent.data.station ?? status.running.target ?? status.station;
  radioOf(draft, intent.id, intent.createdAt, boat, AUTO.motorOff(station, station !== status.station));
}

export function setService(draft: State, intent: IntentOf<"boat.service">) {
  const { boat, inService } = intent.data;
  const status = deriveBoat(draft, boat);
  if (status.inService === inService)
    fail("INVALID_TRANSITION", `${boat} ist bereits ${inService ? "in" : "außer"} Dienst.`);
  if (status.running) fail("INVALID_TRANSITION", `${boat}: erst Motor aus.`);
  draft.boats[boat] = { ...draft.boats[boat], inService, serviceAt: intent.createdAt };
  radioOf(draft, intent.id, intent.createdAt, boat, inService ? AUTO.inService() : AUTO.outOfService());
}

export function setStation(draft: State, intent: IntentOf<"boat.station">) {
  const { boat, station } = intent.data;
  const status = deriveBoat(draft, boat);
  if (status.running) fail("INVALID_TRANSITION", `${boat} ist unterwegs. Verlegung über „Motor läuft“.`);
  if (status.station === station) fail("INVALID_TRANSITION", `${boat} liegt bereits an ${STATIONS[station].label}.`);
  const facts = draft.boats[boat];
  draft.boats[boat] = { ...facts, moves: [...facts.moves, { at: intent.createdAt, station }] };
}

export function setHoursBase(draft: State, intent: IntentOf<"boat.hoursBase">) {
  const { boat, minutes, since } = intent.data;
  draft.boats[boat] = {
    ...draft.boats[boat],
    hoursBase: { minutes, since: since ? toIso(dayStart(since)) : null },
  };
}

export function recordCrew(draft: State, intent: IntentOf<"boat.crew">) {
  draft.crew.push({ id: intent.id, at: intent.createdAt, ...intent.data });
}

/** Zuletzt eingetragene Besatzung eines Boots für einen Tag. */
export function crewOf(state: State, boat: BoatId, date: string) {
  for (let i = state.crew.length - 1; i >= 0; i--) {
    const c = state.crew[i]!;
    if (c.boat === boat && c.date === date) return c;
  }
  return null;
}
