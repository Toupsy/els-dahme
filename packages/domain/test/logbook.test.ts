import { describe, expect, it } from "vitest";
import { deriveBoat, logbookDay, parseTs, type RosterPerson, type State } from "../src";
import { run } from "./helpers";

const DATE = "2026-07-01";
const T = (hm: string) => `${DATE}T${hm}:00.000Z`;
const NOON = parseTs(T("12:00"));

const person = (id: string, role: RosterPerson["role"], at: string): RosterPerson =>
  at.startsWith("78-")
    ? { id, name: id, role, station: null, boat: at as RosterPerson["boat"] }
    : { id, name: id, role, station: at as RosterPerson["station"], boat: null };

/** 78-1 liegt an 9-12, 78-3 an 9-17 (Liegeplätze zu Saisonbeginn). */
const ROSTER = [
  person("Kapitän 1", "BF", "78-1"),
  person("Kapitän 3", "BF", "78-3"),
  person("Turm 12 a", "WG", "9-12"),
  person("Turm 12 b", "WF", "9-12"),
  person("Turm 13", "WG", "9-13"),
  person("Turm 17", "WG", "9-17"),
  person("Wache", "HW", "hw"),
];

const planned = (extra: Parameters<typeof run>[0] = []): State =>
  run([[T("05:00"), { type: "roster.setDay", data: { date: DATE, people: ROSTER } }], ...extra]);

describe("Bootstagebuch: Besatzung aus dem Wachplan", () => {
  it("Bootsführer aus dem Plan, Bootsgäste sind die Turmbesatzung am Liegeplatz", () => {
    const state = planned([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }],
      [T("08:20"), { type: "boat.motorOff", data: { boat: "78-1" } }],
    ]);
    expect(logbookDay(state, "78-1", DATE, NOON).crew).toEqual({
      source: "plan",
      bootsfuehrer: ["Kapitän 1"],
      bootsgaeste: ["Turm 12 a", "Turm 12 b"],
    });
    // Ohne Fahrt zählt der Liegeplatz; der Kapitän eines anderen Boots dort ist kein Bootsgast.
    expect(logbookDay(state, "78-3", DATE, NOON).crew).toEqual({
      source: "plan",
      bootsfuehrer: ["Kapitän 3"],
      bootsgaeste: ["Turm 17"],
    });
  });

  it("nach einer Verlegung zählen die Türme an allen Ausgangspunkten des Tages", () => {
    const state = planned([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Verlegungsfahrt", target: "9-13" } }],
      [T("08:15"), { type: "boat.motorOff", data: { boat: "78-1" } }],
      [T("09:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }],
      [T("09:30"), { type: "boat.motorOff", data: { boat: "78-1" } }],
    ]);
    expect(deriveBoat(state, "78-1", undefined, parseTs(T("08:10"))).station).toBe("9-12");
    expect(deriveBoat(state, "78-1").station).toBe("9-13");
    expect(logbookDay(state, "78-1", DATE, NOON).crew?.bootsgaeste).toEqual(["Turm 12 a", "Turm 12 b", "Turm 13"]);
  });

  it("Abwesend und Umsetzen im ELS wirken auf die Besatzung", () => {
    const state = planned([
      [T("06:00"), { type: "person.away", data: { date: DATE, person: "Kapitän 1", away: true } }],
      [T("06:01"), { type: "person.away", data: { date: DATE, person: "Turm 12 b", away: true } }],
      [T("06:02"), { type: "person.move", data: { date: DATE, person: "Turm 13", station: "9-12" } }],
    ]);
    expect(logbookDay(state, "78-1", DATE, NOON).crew).toEqual({
      source: "plan",
      bootsfuehrer: [],
      bootsgaeste: ["Turm 12 a", "Turm 13"],
    });
  });

  it("ein Eintrag im Boote-Tab gilt vor dem Wachplan; ohne Plan und Eintrag bleibt sie leer", () => {
    const state = planned([
      [
        T("07:00"),
        { type: "boat.crew", data: { boat: "78-1", date: DATE, bootsfuehrer: "Ersatz", bootsgast: "Gast A, Gast B" } },
      ],
    ]);
    expect(logbookDay(state, "78-1", DATE, NOON).crew).toEqual({
      source: "entry",
      bootsfuehrer: ["Ersatz"],
      bootsgaeste: ["Gast A, Gast B"],
    });
    expect(logbookDay(state, "78-1", "2026-07-02", NOON).crew).toBeNull();
  });
});
