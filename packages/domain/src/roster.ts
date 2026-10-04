import { fail } from "./errors";
import { isBoatId, isStationId, type BoatId, type StationId } from "./stations";
import { readWorkbook } from "./xlsx";

/**
 * Wachplan-Import (vereinfacht aus Turmstatus): CSV oder XLSX mit den Spalten
 * Tag, Standort/Code, Position, Person. Reine Umrechnung im Browser; die Namen
 * verlassen das Gerät erst mit der bestätigten Aktion `roster.setDay`.
 */

export const ROSTER_ROLES = ["WF", "WG", "BF", "HW"] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];
export const ROSTER_ROLE_LABELS: Record<RosterRole, string> = {
  WF: "Wachführung",
  WG: "Wachgänger",
  BF: "Bootsführer",
  HW: "Hauptwache",
};

export type RosterPerson = {
  /** Vergleichsform des Namens; eindeutig je Tag. */
  id: string;
  name: string;
  role: RosterRole;
  /** Plan-Standort. Bei Bootsbesatzung null: sie steht dort, wo das Boot liegt. */
  station: StationId | null;
  boat: BoatId | null;
};

const collapse = (v: string) => v.replace(/\s+/g, " ").trim();
export function personKey(name: string): string {
  return collapse(name).toLocaleLowerCase("de");
}

/* ── Dateiformat ─────────────────────────────────────────────────────────── */

/** Trennzeichen der ersten Zeile, Anführungszeichen beachtet. */
export function detectDelimiter(text: string): string {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const delimiter of [",", ";", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) count++;
    }
    if (count > bestCount) [best, bestCount] = [delimiter, count];
  }
  return best;
}

/** CSV mit BOM, \r\n, doppelten Anführungszeichen und Trennzeichen in Feldern. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const body = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
    row = [];
    field = "";
  };
  for (let at = 0; at < body.length; at++) {
    const char = body[at]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (body[at + 1] === '"') {
        field += '"';
        at++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") endRow();
    else if (char !== "\r") field += char;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

const ALIASES = {
  day: ["tag", "datum", "wachtag"],
  standort: ["standort", "ort", "station", "turm"],
  code: ["code", "kennung", "rufname"],
  position: ["position", "funktion", "aufgabe"],
  person: ["person", "name", "kraft"],
} as const;
export type Columns = Record<keyof typeof ALIASES, number>;

/** Spalten anhand der Kopfzeile; null, wenn Tag, Position, Person oder Standort/Code fehlen. */
export function detectColumns(header: readonly string[]): Columns | null {
  const normalized = header.map(personKey);
  const columns = Object.fromEntries(
    Object.entries(ALIASES).map(([key, names]) => [
      key,
      normalized.findIndex((h) => (names as readonly string[]).includes(h)),
    ]),
  ) as Columns;
  if (columns.day < 0 || columns.position < 0 || columns.person < 0) return null;
  if (columns.standort < 0 && columns.code < 0) return null;
  return columns;
}

/** Liest CSV oder XLSX. Bei XLSX gilt das erste Blatt mit erkennbarer Kopfzeile. */
export async function readRosterFile(name: string, bytes: Uint8Array): Promise<string[][]> {
  if (/\.xlsx?$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const sheets = await readWorkbook(bytes);
    const sheet = sheets.find((s) => s.rows.some((r) => detectColumns(r))) ?? sheets[0]!;
    const start = sheet.rows.findIndex((r) => detectColumns(r));
    return start > 0 ? sheet.rows.slice(start) : sheet.rows;
  }
  return parseDelimited(new TextDecoder("utf-8").decode(bytes));
}

/* ── Inhalte ─────────────────────────────────────────────────────────────── */

/** Excel-Seriennummer, ISO, „16.08.2026“ oder „So., 16.08.“ (Jahr aus `year`). */
export function parsePlanDay(value: string, year: number): string | null {
  const text = collapse(value);
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const german = /^(?:[A-Za-zÄÖÜäöü]{2,10}\.?,?\s*)?(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?$/.exec(text);
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(Number(text)) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (german) [d, m, y] = [Number(german[1]), Number(german[2]), german[3] ? Number(german[3]) : year];
  else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Plan-Schreibweise → Station oder Boot („Hauptwache“, „9/14“, „Boot 78/1“). */
export function planTarget(standort: string, code: string): { station: StationId | null; boat: BoatId | null } | null {
  for (const raw of [code, standort]) {
    const text = collapse(raw);
    if (!text) continue;
    if (/^(hauptwache|hw|ad|a\.\s?d\.|zentrale)$/i.test(text)) return { station: "hw", boat: null };
    const key = text
      .replace(/^boot\s*/i, "")
      .replace(/\s+/g, "")
      .replace("/", "-");
    if (isBoatId(key)) return { station: null, boat: key };
    if (isStationId(key)) return { station: key, boat: null };
  }
  return null;
}

/** Position im Plan → Rolle; „GESCHLOSSEN“ bedeutet: Turm an diesem Tag zu (keine Person). */
export function positionRole(position: string): RosterRole | "CLOSED" | null {
  const p = personKey(position).replace(/\.(?=\S)/g, ". ");
  if (p === "führung" || p === "wachführer" || p === "wachführung") return "WF";
  if (p === "wachgänger" || p === "rettungsschwimmer") return "WG";
  if (p === "bootsführer" || p === "bootsgast") return "BF";
  if (p === "hw-wache" || p === "hw" || p === "a. d." || p === "hauptwache") return "HW";
  if (p === "geschlossen") return "CLOSED";
  return null;
}

export type RosterPreview = {
  days: { date: string; people: RosterPerson[] }[];
  warnings: string[];
};

const MAX_DAYS = 120;
const MAX_PEOPLE = 200;

/** Baut die Vorschau. Jeder Tag steht für sich; Doppelbelegungen und Unbekanntes werden gemeldet. */
export function buildRoster(rows: readonly (readonly string[])[], year: number): RosterPreview {
  const columns = rows[0] ? detectColumns(rows[0]) : null;
  if (!columns)
    fail("INVALID_INPUT", "Kopfzeile nicht erkannt. Benötigt werden Tag, Standort oder Code, Position und Person.");
  const days = new Map<string, Map<string, RosterPerson>>();
  const warnings = new Set<string>();
  const cell = (row: readonly string[], index: number) => (index < 0 ? "" : collapse(row[index] ?? ""));
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const date = parsePlanDay(cell(row, columns.day), year);
    const name = cell(row, columns.person);
    const role = positionRole(cell(row, columns.position));
    if (role === "CLOSED" || (!name && !cell(row, columns.position))) return;
    if (!date) return void warnings.add(`Zeile ${line}: Tag „${cell(row, columns.day)}“ nicht lesbar – übersprungen.`);
    if (!name) return;
    if (!role)
      return void warnings.add(`Zeile ${line}: Position „${cell(row, columns.position)}“ unbekannt – übersprungen.`);
    const target = planTarget(cell(row, columns.standort), cell(row, columns.code));
    if (!target)
      return void warnings.add(
        `Zeile ${line}: Standort „${cell(row, columns.code) || cell(row, columns.standort)}“ unbekannt – übersprungen.`,
      );
    const people = days.get(date) ?? new Map<string, RosterPerson>();
    const id = personKey(name);
    if (people.has(id)) return void warnings.add(`${date}: ${name} ist doppelt eingeteilt – erster Eintrag gilt.`);
    if (people.size >= MAX_PEOPLE) fail("INVALID_INPUT", `${date}: mehr als ${MAX_PEOPLE} Einteilungen.`);
    people.set(id, { id, name, role: target.boat ? "BF" : role, ...target });
    days.set(date, people);
    if (days.size > MAX_DAYS)
      fail("INVALID_INPUT", `Mehr als ${MAX_DAYS} Wachtage. Bitte den Zeitraum getrennt einlesen.`);
  });
  if (!days.size) fail("INVALID_INPUT", "Kein lesbarer Wachtag gefunden.");
  return {
    days: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, p]) => ({ date, people: [...p.values()] })),
    warnings: [...warnings],
  };
}
