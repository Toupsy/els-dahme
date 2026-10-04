import { DomainError } from "./errors";

/** Gespeichert wird UTC, Tagesgrenzen gelten nach Ortszeit der Wache. */
export const WATCH_TIME_ZONE = "Europe/Berlin";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE = 60_000;
const DAY = 86_400_000;

export function isUtcTimestamp(value: string): boolean {
  return ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

export function parseTs(value: string): number {
  if (!isUtcTimestamp(value)) throw new DomainError("INVALID_INPUT", `Ungültiger Zeitstempel: ${value}`);
  return Date.parse(value);
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Funkzeiten zählen wie im Papierbuch nur in ganzen Sekunden. */
export function toIsoSeconds(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: WATCH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(ms: number) {
  const parts = Object.fromEntries(partsFormat.formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(ms: number): number {
  const p = localParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

function localToUtc(date: string, hour: number, minute: number): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wall - offsetMs(wall);
  guess = wall - offsetMs(guess);
  return guess;
}

function checkDate(date: string) {
  if (!DATE.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)))
    throw new DomainError("INVALID_INPUT", `Ungültiges Datum: ${date}`);
}

/** Kalendertag der Wache (Europe/Berlin) zu einem Zeitpunkt. */
export function watchDate(at: string | number): string {
  const ms = typeof at === "number" ? at : parseTs(at);
  const p = localParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function shiftDate(date: string, days: number): string {
  checkDate(date);
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** Tagesbeginn 00:00 Ortszeit als UTC-Millisekunden. */
export function dayStart(date: string): number {
  checkDate(date);
  return localToUtc(date, 0, 0);
}

/** Letzte volle Sekunde des Tages (23:59:59 Ortszeit) – Kappungsgrenze offener Fahrten. */
export function dayEndCap(date: string): number {
  return dayStart(shiftDate(date, 1)) - 1000;
}

/** Uhrzeit HH:MM eines Tages in Ortszeit → UTC-Zeitstempel. */
export function watchTimeToUtc(date: string, time: string): string {
  checkDate(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new DomainError("INVALID_INPUT", "Uhrzeit als HH:MM angeben.");
  return toIso(localToUtc(date, Number(match[1]), Number(match[2])));
}

export function formatClock(at: string | number): string {
  const ms = typeof at === "number" ? at : parseTs(at);
  const p = localParts(ms);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatDate(date: string, withWeekday = false): string {
  checkDate(date);
  const [y, m, d] = date.split("-");
  if (!withWeekday) return `${d}.${m}.${y}`;
  const weekday = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    timeZone: "UTC",
  }).format(Date.parse(`${date}T12:00:00Z`));
  return `${weekday}, ${d}.${m}.${y}`;
}

export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / MINUTE);
}
