import { toIso, type Intent, type IntentInput, type IntentType } from "@els/domain";

/**
 * Synthetische Beispieldaten für die Vorschau, relativ zu „jetzt“.
 * Keine echten Namen, keine echten Einsätze.
 */
export function demoSeed(now: number, deviceId: string): Intent[] {
  const intents: Intent[] = [];
  const at = (minutesAgo: number) => toIso(now - minutesAgo * 60_000);
  const add = <T extends IntentType>(minutesAgo: number, input: IntentInput<T>) =>
    intents.push({ id: crypto.randomUUID(), deviceId, createdAt: at(minutesAgo), ...input } as Intent);

  add(180, { type: "radio.append", data: { from: "AD", to: "Alle", text: "Funkanmeldung, Wachbetrieb aufgenommen" } });
  add(150, { type: "radio.append", data: { from: "AD", to: "Alle", text: "Einholen Wetterdaten" } });
  add(148, {
    type: "radio.append",
    data: { from: "AD", to: "Alle", text: "Wasser: 19°C, Luft: 23°C, Wind: SW 3, Luftdruck: 1016 hPa" },
  });
  return intents;
}
