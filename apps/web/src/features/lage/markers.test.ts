import { describe, expect, it } from "vitest";
import { initialState } from "@els/domain";
import { stationMarkers } from "./markers";

describe("Stationsmarker", () => {
  it("zeigen die Zahl der Anwesenden; ein offener Turm ohne Personen fällt mit 0 auf", () => {
    const state = initialState();
    state.towers["9-14"].open = true;
    state.towers["9-15"].open = true;
    const html = Object.fromEntries(
      stationMarkers(state, { hw: 5, "9-14": 2, "9-16": 1 }).map((m) => [m.key.replace("station:", ""), m.html]),
    );
    expect(html["hw"]).toContain('title="5 Personen anwesend"');
    expect(html["9-14"]).toContain('<small class="crew" title="2 Personen anwesend">');
    expect(html["9-15"]).toContain('<small class="crew empty" title="0 Personen anwesend">');
    expect(html["9-16"]).toContain('title="1 Person anwesend"');
    expect(html["9-17"]).not.toContain("crew");
  });
});
