import { describe, expect, it } from "vitest";
import { applyIntent, boatHours, boatStatuses, dayTrips, effectiveRadio, parseTs, type State } from "../src";
import { make, run } from "./helpers";

const T = (hm: string) => `2026-07-01T${hm}:00.000Z`;
const lastText = (state: State) => state.radio.at(-1)!.text;

describe("Boote", () => {
  it("Motor läuft erzeugt den Funkspruch, der Status wird daraus berechnet", () => {
    const state = run([[T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }]]);
    expect(state.radio.at(-1)).toMatchObject({
      from: "78-1",
      to: "AD",
      text: "Motor läuft, Kontrollfahrt",
      auto: true,
    });
    expect(boatStatuses(state)["78-1"].running).toMatchObject({ purpose: "Kontrollfahrt", since: T("08:00") });
  });

  it("Fahrtwechsel nutzt die Kurzformen der Feature-App", () => {
    let state = run([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }],
      [T("08:10"), { type: "boat.switch", data: { boat: "78-1", purpose: "Einsatzfahrt" } }],
    ]);
    expect(lastText(state)).toBe("Einsatzfahrt aufgenommen");
    state = run([[T("08:20"), { type: "boat.switch", data: { boat: "78-1", purpose: "Kontrollfahrt" } }]], state);
    expect(lastText(state)).toBe("Zurück zu Kontrollfahrt");
    state = run([[T("08:25"), { type: "boat.switch", data: { boat: "78-1", purpose: "Materialtransport" } }]], state);
    expect(lastText(state)).toBe("Fahrtwechsel, Materialtransport");
    expect(boatStatuses(state)["78-1"].running?.since).toBe(T("08:00"));
  });

  it("Verlegung: Liegeplatz wechselt erst mit Motor aus am Ziel", () => {
    let state = run([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Verlegungsfahrt", target: "9-15" } }],
    ]);
    expect(lastText(state)).toBe("Motor läuft, Verlegungsfahrt nach 9-15");
    expect(boatStatuses(state)["78-1"].station).toBe("9-12");
    state = run([[T("08:30"), { type: "boat.motorOff", data: { boat: "78-1" } }]], state);
    expect(lastText(state)).toBe("Motor aus, E-klar 9-15");
    expect(boatStatuses(state)["78-1"]).toMatchObject({ station: "9-15", running: null });
  });

  it("Motor aus an der Hauptwache und am eigenen Turm", () => {
    let state = run([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-2", purpose: "Einsatzfahrt" } }],
      [T("08:30"), { type: "boat.motorOff", data: { boat: "78-2", station: "hw" } }],
    ]);
    expect(lastText(state)).toBe("Motor aus, an der Hauptwache");
    expect(boatStatuses(state)["78-2"].station).toBe("hw");
    state = run(
      [
        [T("09:00"), { type: "boat.motorOn", data: { boat: "78-2", purpose: "Kontrollfahrt" } }],
        [T("09:30"), { type: "boat.motorOff", data: { boat: "78-2" } }],
      ],
      state,
    );
    expect(lastText(state)).toBe("Motor aus, an der Hauptwache");
  });

  it("verbietet unsinnige Übergänge", () => {
    const running = run([[T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }]]);
    const again = make(T("08:01"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } });
    expect(() => applyIntent(running, again)).toThrow(/läuft bereits/);
    expect(() =>
      applyIntent(running, make(T("08:02"), { type: "boat.service", data: { boat: "78-1", inService: false } })),
    ).toThrow(/Motor aus/);
    expect(() => run([[T("08:00"), { type: "boat.motorOff", data: { boat: "78-3" } }]])).toThrow(/bereits aus/);
    expect(() =>
      run([[T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Verlegungsfahrt" } }]]),
    ).toThrow(/Ziel/);
    const off = run([[T("08:00"), { type: "boat.service", data: { boat: "78-3", inService: false } }]]);
    expect(() =>
      run([[T("08:10"), { type: "boat.motorOn", data: { boat: "78-3", purpose: "Probefahrt" } }]], off),
    ).toThrow(/außer Dienst/);
  });

  it("ein abgewiesener Fachfehler lässt den Zustand unverändert", () => {
    const state = run([[T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }]]);
    const before = JSON.stringify(state);
    expect(() =>
      applyIntent(state, make(T("08:01"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } })),
    ).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("Liegeplatz-Korrektur nur am Liegeplatz, ohne Funkspruch", () => {
    const state = run([[T("08:00"), { type: "boat.station", data: { boat: "78-3", station: "hw" } }]]);
    expect(boatStatuses(state)["78-3"].station).toBe("hw");
    expect(state.radio).toHaveLength(0);
  });

  it("ein von Hand gefunkter Motor-Spruch zählt wie ein automatischer", () => {
    const state = run([
      [T("08:00"), { type: "radio.append", data: { from: "78-2", to: "AD", text: "Motor läuft, Probefahrt" } }],
    ]);
    expect(boatStatuses(state)["78-2"].running?.purpose).toBe("Probefahrt");
  });

  it("eine Korrektur im Funkbuch steht sofort in Fahrt und Betriebsstunden", () => {
    let state = run([
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }],
      [T("08:30"), { type: "boat.motorOff", data: { boat: "78-1" } }],
    ]);
    const now = parseTs("2026-07-02T10:00:00.000Z");
    const hours = () =>
      boatHours(effectiveRadio(state.radio), "78-1", "2026-07-01", now, state.boats["78-1"].hoursBase);
    expect(hours().dayMin).toBe(30);
    const off = state.radio.at(-1)!;
    state = run(
      [
        [
          T("09:00"),
          { type: "radio.correct", data: { of: off.id, from: "78-1", to: "AD", text: off.text, at: T("08:45") } },
        ],
      ],
      state,
    );
    expect(hours().dayMin).toBe(45);
    expect(dayTrips(effectiveRadio(state.radio), "78-1", "2026-07-01", now)[0]!.minutes).toBe(45);
  });

  it("Übertrag mit Stichtag zählt ab 00:00 Ortszeit", () => {
    const state = run([
      [T("06:00"), { type: "boat.hoursBase", data: { boat: "78-1", minutes: 7305, since: "2026-07-01" } }],
      [T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }],
      [T("09:33"), { type: "boat.motorOff", data: { boat: "78-1" } }],
    ]);
    expect(state.boats["78-1"].hoursBase).toEqual({ minutes: 7305, since: "2026-06-30T22:00:00.000Z" });
    const h = boatHours(
      effectiveRadio(state.radio),
      "78-1",
      "2026-07-02",
      parseTs("2026-07-02T12:00:00.000Z"),
      state.boats["78-1"].hoursBase,
    );
    expect(h).toEqual({ dayMin: 0, carryMin: 7398, totalMin: 7398 });
  });

  it("Besatzung ist append-only, der letzte Eintrag des Tages gilt", async () => {
    const { crewOf } = await import("../src");
    const state = run([
      [
        T("07:00"),
        { type: "boat.crew", data: { boat: "78-1", date: "2026-07-01", bootsfuehrer: "A", bootsgast: "B" } },
      ],
      [
        T("07:10"),
        { type: "boat.crew", data: { boat: "78-1", date: "2026-07-01", bootsfuehrer: "A", bootsgast: "C" } },
      ],
    ]);
    expect(state.crew).toHaveLength(2);
    expect(crewOf(state, "78-1", "2026-07-01")?.bootsgast).toBe("C");
  });
});
