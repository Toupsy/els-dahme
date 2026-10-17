import { describe, expect, it } from "vitest";
import { dutyRoster, occupancy, rosterFromDuty, wachplanDutySchema, type RosterPerson } from "../src";
import { run } from "./helpers";

/** Antwort des Wachplan-Generators (GET /api/els/duty), synthetische Namen. */
const DUTY = wachplanDutySchema.parse({
  plan: "Woche 33",
  revision: 7,
  days: [
    {
      date: "2026-08-16",
      people: [
        { id: "u-1", name: "Anna Alpha", role: "F", slot: "lead", code: "HW" },
        { id: "u-2", name: "Bernd Beta", role: "W", slot: "guard", code: "HW" },
        { id: "u-3", name: "Carla Gamma", role: "B", slot: "standby", code: "HW" },
        { id: "u-4", name: "Dirk Delta", role: "B", slot: "captain", code: "78/1" },
        { id: "u-5", name: "Erik Epsilon", role: "W", slot: "tower", code: "9/12" },
        { id: "u-6", name: "Fritz Fünf", role: "B", slot: "tower", code: "9/13" },
        { id: "u-7", name: "Gerd Gast", role: "B", slot: "crew", code: "78/2" },
        { id: "u-8", name: "Hanna Heim", role: "W", slot: "tower", code: "9/19" },
        { id: "u-9", name: "Ida Irrtum", role: "W", slot: "tower", code: "78/3" },
        { id: "u-5", name: "Erik Epsilon", role: "W", slot: "tower", code: "9/14" },
      ],
    },
  ],
});

describe("Wachplan-Anbindung", () => {
  it("bildet Plätze auf Stationen, Boote und Rollen ab", () => {
    const { people, warnings } = rosterFromDuty(DUTY.days[0]!);
    expect(people.map((p) => `${p.id} ${p.role}@${p.station ?? p.boat}`)).toEqual([
      "u-1 WF@hw",
      "u-2 HW@hw",
      "u-3 HW@hw",
      "u-4 BF@78-1",
      "u-5 WG@9-12",
      "u-6 BF@9-13",
      "u-7 WG@78-2",
    ]);
    expect(warnings).toEqual([
      "Hanna Heim: Kennung „9/19“ gibt es im ELS nicht – nicht übernommen.",
      "Ida Irrtum: Kennung „78/3“ gibt es im ELS nicht – nicht übernommen.",
      "Erik Epsilon steht doppelt im Wachplan – erster Eintrag gilt.",
    ]);
  });

  it("weist eine Antwort mit fremdem Aufbau ab", () => {
    expect(
      wachplanDutySchema.safeParse({ plan: "x", revision: 1, days: [{ date: "16.08.", people: [] }] }).success,
    ).toBe(false);
    expect(
      wachplanDutySchema.safeParse({
        plan: "x",
        revision: 1,
        days: [{ date: "2026-08-16", people: [{ id: "a", name: "A", role: "X", slot: "tower", code: "9/12" }] }],
      }).success,
    ).toBe(false);
  });

  it("Bootsführer steht am Liegeplatz bei der Turmbesatzung; Umsetzen übersteht eine neue Lieferung", () => {
    const people = rosterFromDuty(DUTY.days[0]!).people;
    const date = "2026-08-16";
    let state = run([["2026-08-16T06:00:00Z", { type: "roster.setDay", data: { date, people } }]]);
    expect(occupancy(state, date)["9-12"].map((p) => p.name)).toEqual(["Dirk Delta", "Erik Epsilon"]);

    state = run(
      [["2026-08-16T08:00:00Z", { type: "person.move", data: { date, person: "u-5", station: "9-15" } }]],
      state,
    );
    const changed: RosterPerson[] = people.map((p) => (p.id === "u-2" ? { ...p, station: "9-16", role: "WG" } : p));
    state = run([["2026-08-16T09:00:00Z", { type: "roster.setDay", data: { date, people: changed } }]], state);
    const at = Object.fromEntries(dutyRoster(state, date).map((p) => [p.id, p.at]));
    expect(at["u-5"]).toBe("9-15");
    expect(at["u-2"]).toBe("9-16");
  });
});
