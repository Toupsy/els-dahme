import { describe, expect, it } from "vitest";
import { run } from "./helpers";

const T = (hm: string) => `2026-07-01T${hm}:00.000Z`;

describe("Türme", () => {
  it("Aufrödeln, Flagge, Abrödeln mit Funksprüchen", () => {
    let state = run([
      [T("07:00"), { type: "tower.rigUp", data: { station: "9-14" } }],
      [T("07:05"), { type: "tower.flag", data: { station: "9-14", flag: "gelb" } }],
    ]);
    expect(state.towers["9-14"]).toEqual({ open: true, flag: "gelb" });
    expect(state.radio.map((r) => [r.from, r.text])).toEqual([
      ["9-14", "Turm aufgerödelt, E-klar"],
      ["9-14", "Flagge Gelb gesetzt"],
    ]);
    state = run([[T("18:00"), { type: "tower.rigDown", data: { station: "9-14" } }]], state);
    expect(state.towers["9-14"]).toEqual({ open: false, flag: "" });
    expect(state.radio.at(-1)!.text).toBe("Turm abgerödelt, nicht mehr E-klar");
  });

  it("mit dem letzten Turm kommt auch die Flagge der Hauptwache herunter", () => {
    let state = run([
      [T("07:00"), { type: "tower.rigUp", data: { station: "9-12" } }],
      [T("07:01"), { type: "tower.rigUp", data: { station: "9-13" } }],
      [T("07:02"), { type: "tower.flag", data: { station: "hw", flag: "gelb_windsack" } }],
      [T("18:00"), { type: "tower.rigDown", data: { station: "9-12" } }],
    ]);
    expect(state.towers.hw.flag).toBe("gelb_windsack");
    state = run([[T("18:05"), { type: "tower.rigDown", data: { station: "9-13" } }]], state);
    expect(state.towers.hw.flag).toBe("");
  });

  it("weist doppelte und unzulässige Aktionen ab", () => {
    const open = run([[T("07:00"), { type: "tower.rigUp", data: { station: "9-15" } }]]);
    expect(() => run([[T("07:01"), { type: "tower.rigUp", data: { station: "9-15" } }]], open)).toThrow(/bereits/);
    expect(() => run([[T("07:00"), { type: "tower.rigDown", data: { station: "9-16" } }]])).toThrow(
      /nicht aufgerödelt/,
    );
    expect(() => run([[T("07:00"), { type: "tower.flag", data: { station: "9-16", flag: "rot" } }]])).toThrow(
      /nicht aufgerödelt/,
    );
    expect(() => run([[T("07:00"), { type: "tower.rigUp", data: { station: "hw" } }]])).toThrow(/Hauptwache/);
  });
});
