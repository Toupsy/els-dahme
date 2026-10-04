import { describe, expect, it } from "vitest";
import reference from "../reference/feature-app-boat-hours.json";
import {
  boatHours,
  computeBoatTrips,
  dayTrips,
  formatHours,
  formatRuntime,
  hoursInputValue,
  parseHoursInput,
  parseTs,
  tripPurpose,
} from "../src";

type Scenario = (typeof reference)[number];
const BOATS = ["78-1", "78-2", "78-3"] as const;

/**
 * Referenzwerte: dieselben Funksprüche durch den Originalcode der Feature-App
 * gerechnet (reference/ref.php → api/boats.php + php/main/boat_hours.php,
 * reference/ref.cjs → els/scripts/funktagebuch.js).
 */
describe("Bootstagebuch stimmt mit der Feature-App überein", () => {
  for (const s of reference as Scenario[]) {
    describe(s.name, () => {
      const now = parseTs(s.now);
      for (const boat of BOATS) {
        const expected = s.expected[boat];
        it(`${boat}: Einsatztag, Übertrag, Gesamt`, () => {
          expect(boatHours(s.entries, boat, s.date, now, { minutes: s.baseMin, since: s.baseAt })).toEqual({
            dayMin: expected.dayMin,
            carryMin: expected.carryMin,
            totalMin: expected.totalMin,
          });
        });
        it(`${boat}: Fahrten des Tages`, () => {
          const trips = dayTrips(s.entries, boat, s.date, now);
          expect(
            trips.map((t) => ({
              startedAt: t.startedAt,
              endedAt: t.endedAt,
              minutes: t.minutes,
              legs: t.legs.map((l) => l.reason),
            })),
          ).toEqual(expected.trips);
          // Einsatztag = Summe der Laufzeit-Spalte (Rundung je Fahrt).
          expect(trips.reduce((sum, t) => sum + t.minutes, 0)).toBe(expected.dayMin);
        });
      }
    });
  }
});

describe("Fahrten", () => {
  const e = (at: string, text: string, from = "78-1") => ({ at: `2026-07-01T${at}.000Z`, from, text });

  it("führt Abschnitte bei Fahrtwechsel und benennt den Zweck wie im Buch", () => {
    const [trip] = computeBoatTrips(
      [
        e("08:00:00", "Motor läuft, Kontrollfahrt"),
        e("08:05:00", "Einsatzfahrt aufgenommen"),
        e("08:06:00", "Einsatzfahrt aufgenommen"),
        e("08:20:00", "Zurück zu Kontrollfahrt"),
        e("08:30:00", "Motor aus, E-klar Strand"),
      ],
      ["78-1"],
    );
    expect(trip!.legs.map((l) => l.reason)).toEqual(["Kontrollfahrt", "Einsatzfahrt", "Kontrollfahrt"]);
    expect(tripPurpose(trip!)).toBe("Kontrollfahrt → Einsatz → Kontrollfahrt");
  });

  it("Lagemeldungen ohne Motor-Präfix starten und beenden keine Fahrt", () => {
    expect(computeBoatTrips([e("08:00:00", "Eintreffen Einsatzstelle")], ["78-1"])).toEqual([]);
  });

  it("Materialtransport und Verlegung mit Ziel in Buchschreibweise", () => {
    const trips = computeBoatTrips(
      [
        e("08:00:00", "Motor läuft, Materialtransport"),
        e("08:10:00", "Fahrtwechsel, Verlegungsfahrt nach 9-14"),
        e("08:20:00", "Motor aus, E-klar 9-14"),
      ],
      ["78-1"],
    );
    expect(tripPurpose(trips[0]!)).toBe("MT → Verlegung nach 9-14");
  });
});

describe("Schreibweisen", () => {
  it("Laufzeit in Minuten, ab einer Stunde mit Lesehilfe", () => {
    expect(formatRuntime(37)).toBe("37 min");
    expect(formatRuntime(93)).toBe("93 min · 1:33 h");
  });

  it("Betriebsstunden in Dezimalstunden", () => {
    expect(formatHours(93)).toBe("1,55 Std.");
    expect(formatHours(12679)).toBe("211,32 Std.");
    expect(formatHours(0)).toBe("0,00 Std.");
  });

  it("Übertrag aus dem Papierbuch wie dahme_parse_hours_input", () => {
    expect(parseHoursInput("121,75")).toBe(7305);
    expect(parseHoursInput("121.75")).toBe(7305);
    expect(parseHoursInput("121:45")).toBe(7305);
    expect(parseHoursInput("121:5")).toBe(7265);
    expect(parseHoursInput("")).toBe(0);
    expect(() => parseHoursInput("12h")).toThrow(/121,75/);
    expect(hoursInputValue(7305)).toBe("121,75");
  });
});
