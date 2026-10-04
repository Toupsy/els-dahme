import {
  offset,
  parseIntent,
  seaBearing,
  shiftDate,
  stationPoint,
  toIso,
  watchDate,
  type Intent,
  type IntentInput,
  type IntentType,
} from "@els/domain";

/**
 * Synthetische Beispieldaten für die Vorschau, relativ zu „jetzt“.
 * Keine echten Namen, keine echten Einsätze.
 */
export function demoSeed(now: number, deviceId: string): Intent[] {
  const intents: Intent[] = [];
  const add = <T extends IntentType>(minutesAgo: number, input: IntentInput<T>): string => {
    const intent = parseIntent({
      id: crypto.randomUUID(),
      deviceId,
      createdAt: toIso(now - minutesAgo * 60_000),
      ...input,
    });
    intents.push(intent);
    return intent.id;
  };
  const today = watchDate(now);

  add(300, { type: "boat.hoursBase", data: { boat: "78-1", minutes: 12_540, since: shiftDate(today, -14) } });
  add(300, { type: "boat.hoursBase", data: { boat: "78-2", minutes: 9_870, since: shiftDate(today, -14) } });
  add(300, { type: "boat.hoursBase", data: { boat: "78-3", minutes: 4_215, since: shiftDate(today, -14) } });
  add(240, { type: "radio.append", data: { from: "AD", to: "Alle", text: "Funkanmeldung, Wachbetrieb aufgenommen" } });
  for (const [i, station] of (["9-12", "9-13", "9-14", "9-15", "9-17"] as const).entries())
    add(235 - i, { type: "tower.rigUp", data: { station } });
  add(228, { type: "tower.flag", data: { station: "hw", flag: "gelb" } });
  add(227, { type: "tower.flag", data: { station: "9-14", flag: "gelb" } });
  add(226, { type: "tower.flag", data: { station: "9-13", flag: "gelb_windsack" } });
  add(225, {
    type: "boat.crew",
    data: { boat: "78-1", date: today, bootsfuehrer: "Mara Muster", bootsgast: "Finn Beispiel" },
  });
  add(225, {
    type: "boat.crew",
    data: { boat: "78-2", date: today, bootsfuehrer: "Lea Demo", bootsgast: "Jonas Probe" },
  });
  add(210, { type: "radio.append", data: { from: "AD", to: "Alle", text: "Einholen Wetterdaten" } });
  add(208, {
    type: "radio.append",
    data: { from: "AD", to: "Alle", text: "Wasser: 19°C, Luft: 23°C, Wind: SW 3, Luftdruck: 1016 hPa" },
  });
  add(200, { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } });
  add(163, { type: "boat.motorOff", data: { boat: "78-1" } });
  add(150, { type: "boat.motorOn", data: { boat: "78-2", purpose: "Ausbildungsfahrt" } });
  add(121, { type: "boat.switch", data: { boat: "78-2", purpose: "Einsatzfahrt" } });
  add(118, { type: "radio.append", data: { from: "78-2", to: "AD", text: "Eintreffen Einsatzstelle" } });
  add(96, { type: "boat.motorOff", data: { boat: "78-2", station: "hw" } });
  add(60, { type: "radio.append", data: { from: "9-15", to: "AD", text: "Freiwache zum Strand" } });
  add(34, { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } });

  // Laufender Einsatz vor 9-14 mit Boot, Turm und Kräften der Hauptwache.
  const incident = add(14, {
    type: "incident.open",
    data: {
      title: "9-14",
      note: "Person treibt ab, ca. 80 m vor der Buhne",
      point: offset(stationPoint("9-14"), 180, seaBearing() - 20),
    },
  });
  add(13, { type: "incident.assign", data: { incident, resource: { kind: "tower", station: "9-14" } } });
  const boat = add(12, { type: "incident.assign", data: { incident, resource: { kind: "boat", boat: "78-3" } } });
  add(11, { type: "incident.assign", data: { incident, resource: { kind: "team", count: 2 } } });
  add(7, { type: "incident.event", data: { incident, resource: boat, event: "Eintreffen Einsatzstelle" } });
  return intents;
}
