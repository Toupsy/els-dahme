import { fail } from "./errors";
import type { RadioEntry, State } from "./state";
import { parseTs, toIsoSeconds, watchDate } from "./time";

export type RadioDraft = { from: string; to: string; text: string; at: string };

/** Hängt einen Funkeintrag an. IDs folgen aus der Aktion, damit Gerät und Server dieselben Einträge bilden. */
export function appendRadio(
  draft: State,
  intentId: string,
  index: number,
  entry: RadioDraft,
  auto: boolean,
  correctionOf: string | null = null,
): RadioEntry {
  const created: RadioEntry = {
    id: index === 0 ? intentId : `${intentId}:${index}`,
    intentId,
    at: toIsoSeconds(parseTs(entry.at)),
    from: entry.from,
    to: entry.to,
    text: entry.text,
    correctionOf,
    auto,
  };
  draft.radio.push(created);
  return created;
}

function byTime(a: RadioEntry, b: RadioEntry) {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

/**
 * Gültige Einträge: Korrigierte Originale werden ausgeblendet, die Korrektur
 * tritt an ihre Stelle. Sortiert nach Funkzeit, bei Gleichstand in Eingangsfolge.
 */
export function effectiveRadio(entries: readonly RadioEntry[]): RadioEntry[] {
  const replaced = new Set<string>();
  for (const e of entries) if (e.correctionOf) replaced.add(e.correctionOf);
  return entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !replaced.has(e.id))
    .sort((a, b) => byTime(a.e, b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** Ein Eintrag darf nur korrigiert werden, solange er gültig ist (Kette ohne Verzweigung). */
export function assertCorrectable(state: State, id: string) {
  const target = state.radio.find((e) => e.id === id);
  if (!target) fail("CONFLICT", "Der zu korrigierende Funkeintrag fehlt.");
  if (state.radio.some((e) => e.correctionOf === id)) fail("CONFLICT", "Dieser Eintrag wurde bereits korrigiert.");
}

/** Korrekturverlauf eines gültigen Eintrags, ältester zuerst. */
export function correctionChain(entries: readonly RadioEntry[], id: string): RadioEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const chain: RadioEntry[] = [];
  let cursor = byId.get(id);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.correctionOf ? byId.get(cursor.correctionOf) : undefined;
  }
  return chain;
}

export function radioOfDay(entries: readonly RadioEntry[], date: string): RadioEntry[] {
  return effectiveRadio(entries).filter((e) => watchDate(e.at) === date);
}
