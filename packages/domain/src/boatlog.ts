import { fail } from "./errors";
import { classifyMotorMessage, purposeInBook } from "./funk";
import { dayEndCap, dayStart, parseTs, watchDate } from "./time";

/**
 * Bootstagebuch: Fahrten und Betriebsstunden aus den „Motor läuft/aus“-
 * Funksprüchen. Regel für Regel wie in der Feature-App
 * (els/scripts/funktagebuch.js `computeBoatTrips`, php/main/boat_hours.php,
 * api/boats.php GET /boats/hours). Referenzwerte: reference/feature-app-boat-hours.json
 *
 *   · „Motor läuft, <Grund>“ startet eine Fahrt, „Motor aus…“ beendet sie
 *   · ein weiteres „Motor läuft“ oder „Fahrtwechsel, …“ bei laufendem Motor ist
 *     ein neuer Abschnitt derselben Fahrt
 *   · Laufzeit je Fahrt in vollen Minuten, kaufmännisch gerundet, danach summiert
 *   · eine Fahrt ohne „Motor aus“ endet am Ende ihres Tages (23:59:59), heute jetzt
 */

export type MotorEntry = { at: string; from: string; text: string };
export type Leg = { reason: string; startedAt: string; endedAt: string | null };
export type Trip = { callSign: string; reason: string; startedAt: string; endedAt: string | null; legs: Leg[] };

/** Fahrten mit Abschnitten. Erwartet gültige Einträge (nach Korrekturen). */
export function computeBoatTrips(entries: readonly MotorEntry[], callSigns: readonly string[]): Trip[] {
  const boats = new Set(callSigns);
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => parseTs(a.e.at) - parseTs(b.e.at) || a.i - b.i);
  const trips: Trip[] = [];
  const open = new Map<string, Trip>();
  const switchLeg = (trip: Trip, reason: string, at: string) => {
    const current = trip.legs[trip.legs.length - 1]!;
    if (current.reason === reason) return;
    current.endedAt = at;
    trip.legs.push({ reason, startedAt: at, endedAt: null });
    trip.reason = reason;
  };
  for (const { e } of sorted) {
    if (!boats.has(e.from)) continue;
    const running = open.get(e.from);
    const message = classifyMotorMessage(e.text);
    if (message.kind === "start") {
      if (running) {
        switchLeg(running, message.reason, e.at);
        continue;
      }
      const trip: Trip = {
        callSign: e.from,
        reason: message.reason,
        startedAt: e.at,
        endedAt: null,
        legs: [{ reason: message.reason, startedAt: e.at, endedAt: null }],
      };
      open.set(e.from, trip);
      trips.push(trip);
    } else if (message.kind === "stop") {
      if (running) {
        running.endedAt = e.at;
        running.legs[running.legs.length - 1]!.endedAt = e.at;
        open.delete(e.from);
      }
    } else if (message.kind === "change" && running) switchLeg(running, message.reason, e.at);
  }
  return trips;
}

/** Volle Minuten, kaufmännisch gerundet. */
export function roundMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000));
}

/** Ende der Rechnung für offene Fahrten eines Tages: heute jetzt, sonst 23:59:59.999. */
export function dayCap(date: string, now: number): number {
  return date === watchDate(now) ? now : dayEndCap(date) + 999;
}

export function spanMs(span: { startedAt: string; endedAt: string | null }, capMs: number): number {
  const start = parseTs(span.startedAt);
  const end = span.endedAt ? parseTs(span.endedAt) : capMs;
  return Math.max(0, end - start);
}

export type DayTrip = Trip & { minutes: number; legMinutes: number[]; running: boolean };

/** Fahrten eines Boots an einem Tag (Einträge 00:00–23:59:59 Ortszeit), wie Boote-Tab und Tagebuch-Blatt. */
export function dayTrips(entries: readonly MotorEntry[], callSign: string, date: string, now: number): DayTrip[] {
  const from = dayStart(date);
  const to = dayEndCap(date) + 999;
  const ofDay = entries.filter((e) => {
    const t = parseTs(e.at);
    return t >= from && t <= to;
  });
  const cap = dayCap(date, now);
  const isToday = date === watchDate(now);
  return computeBoatTrips(ofDay, [callSign]).map((trip) => ({
    ...trip,
    minutes: roundMinutes(spanMs(trip, cap)),
    legMinutes: trip.legs.map((leg) => roundMinutes(spanMs(leg, cap))),
    running: !trip.endedAt && isToday,
  }));
}

/** Einsatzzweck einer Fahrt in der Schreibweise des Buchs („Kontrollfahrt → Einsatz“). */
export function tripPurpose(trip: Trip): string {
  return trip.legs.map((l) => purposeInBook(l.reason)).join(" → ");
}

/** Erfasste Fahrtminuten eines Boots im Zeitfenster [since, until] (Port von dahme_boat_tracked_minutes). */
export function trackedMinutes(
  entries: readonly MotorEntry[],
  callSign: string,
  sinceMs: number | null,
  untilMs: number,
): number {
  const rows = entries
    .map((e, i) => ({ t: parseTs(e.at), text: e.text.trim(), from: e.from, i }))
    .filter((r) => r.from === callSign && (sinceMs === null || r.t >= sinceMs) && r.t <= untilMs)
    .sort((a, b) => a.t - b.t || a.i - b.i);
  let minutes = 0;
  let openAt: number | null = null;
  for (const r of rows) {
    if (r.text.startsWith("Motor läuft, ")) {
      if (openAt === null) openAt = r.t;
    } else if (r.text.startsWith("Motor aus")) {
      if (openAt !== null) {
        minutes += roundMinutes(r.t - openAt);
        openAt = null;
      }
    }
  }
  if (openAt !== null) {
    const end = Math.min(dayEndCap(watchDate(openAt)), untilMs);
    minutes += roundMinutes(Math.max(0, end - openAt));
  }
  return minutes;
}

export type HoursBase = { minutes: number; since: string | null };
export type BoatHours = { dayMin: number; carryMin: number; totalMin: number };

/**
 * Betriebsstunden wie die drei Zeilen im Buch:
 *   Einsatztag = Fahrten des Tages
 *   Übertrag   = eingetragener Stand + alle Fahrten ab Stichtag bis zum Vortag
 *   Gesamt     = Übertrag + Einsatztag (morgen der Übertrag)
 */
export function boatHours(
  entries: readonly MotorEntry[],
  callSign: string,
  date: string,
  now: number,
  base: HoursBase,
): BoatHours {
  const from = dayStart(date);
  const until = Math.min(dayEndCap(date), Math.floor(now / 1000) * 1000);
  const since = base.since ? parseTs(base.since) : null;
  const carryMin = base.minutes + trackedMinutes(entries, callSign, since, from - 1000);
  const dayMin = trackedMinutes(entries, callSign, from, until);
  return { dayMin, carryMin, totalMin: carryMin + dayMin };
}

/* ── Schreibweisen ───────────────────────────────────────────────────────── */

/** Laufzeit-Spalte: „37 min“, ab einer Stunde mit Lesehilfe „93 min · 1:33 h“. */
export function formatRuntime(minutes: number): string {
  const hm = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
  return minutes >= 60 ? `${minutes} min · ${hm}` : `${minutes} min`;
}

/** Betriebsstunden in Dezimalstunden wie im Buch: „1,55 Std.“ */
export function formatHours(minutes: number): string {
  return `${(Math.max(0, minutes) / 60).toFixed(2).replace(".", ",")} Std.`;
}

/** Übertrag aus dem Papierbuch: „121,75“ (dezimal) oder „121:45“ (Std:Min) → Minuten. */
export function parseHoursInput(input: string): number {
  const value = input.trim();
  if (value === "") return 0;
  const hm = /^(\d+):([0-5]?\d)$/.exec(value);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  if (/^\d+([.,]\d+)?$/.test(value)) return Math.round(Number(value.replace(",", ".")) * 60);
  return fail("INVALID_INPUT", "Betriebsstunden als 121,75 oder 121:45 eingeben.");
}

export function hoursInputValue(minutes: number): string {
  return (Math.max(0, minutes) / 60).toFixed(2).replace(".", ",");
}
