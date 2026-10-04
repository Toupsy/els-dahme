import { describe, expect, it } from "vitest";
import { applyIntent, initialState, parseIntent, replay, type Intent } from "../src";
import { make } from "./helpers";

const T = (hm: string) => `2026-07-01T${hm}:00.000Z`;

describe("Sync-Reducer", () => {
  const intents: Intent[] = [
    make(T("07:00"), { type: "tower.rigUp", data: { station: "9-13" } }),
    make(T("08:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }),
    make(T("08:01"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }),
    make(T("08:30"), { type: "boat.motorOff", data: { boat: "78-1" } }),
    make(T("08:31"), { type: "radio.append", data: { from: "AD", to: "Alle", text: "Funkprobe" } }),
  ];

  it("Abspielen ergibt denselben Zustand wie schrittweises Anwenden", () => {
    let stepwise = initialState();
    for (const intent of intents) {
      try {
        stepwise = applyIntent(stepwise, intent);
      } catch {
        // abgewiesen
      }
    }
    const { state, rejected } = replay(intents);
    expect(state).toEqual(stepwise);
    expect(rejected.map((r) => r.intent.id)).toEqual([intents[2]!.id]);
  });

  it("Funkeinträge erhalten IDs aus der Aktion – auf jedem Gerät gleich", () => {
    const a = replay(intents).state.radio.map((r) => r.id);
    const b = replay(intents).state.radio.map((r) => r.id);
    expect(a).toEqual(b);
    expect(a[0]).toBe(intents[0]!.id);
  });

  it("entfernt unbekannte Felder und setzt Vorgabewerte", () => {
    const parsed = parseIntent({
      ...make(T("08:00"), { type: "boat.motorOff", data: { boat: "78-2" } }),
      extra: "weg",
    });
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.data).toEqual({ boat: "78-2", station: null });
  });

  it("weist ungültige Formen ab", () => {
    expect(() => parseIntent({ type: "boat.motorOn", data: {} })).toThrow(/Aktion ungültig/);
    expect(() =>
      parseIntent({
        ...make(T("08:00"), { type: "radio.append", data: { from: "AD", to: "Alle", text: "x" } }),
        createdAt: "gestern",
      }),
    ).toThrow(/createdAt/);
  });

  it("Korrekturen bilden eine Kette ohne Verzweigung", () => {
    const first = make(T("08:00"), { type: "radio.append", data: { from: "AD", to: "Alle", text: "A" } });
    const fix = make(T("08:01"), {
      type: "radio.correct",
      data: { of: first.id, from: "AD", to: "Alle", text: "B", at: T("08:00") },
    });
    const second = make(T("08:02"), {
      type: "radio.correct",
      data: { of: first.id, from: "AD", to: "Alle", text: "C", at: T("08:00") },
    });
    const { state, rejected } = replay([first, fix, second]);
    expect(state.radio.map((r) => r.text)).toEqual(["A", "B"]);
    expect(rejected[0]!.error.message).toMatch(/bereits korrigiert/);
  });
});
