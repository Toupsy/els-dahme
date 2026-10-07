import { describe, expect, it } from "vitest";
import { initialState } from "@els/domain";
import { stationMarkers } from "./markers";

describe("Stationsmarker", () => {
  it("zeigen die Zahl der Anwesenden; ein offener Turm ohne Personen fällt mit 0 auf", () => {
    const state = initialState();
    state.towers["9-14"].open = true;
    state.towers["9-15"].open = true;
    const markers = stationMarkers(state, {
      hw: { count: 5, short: false },
      "9-14": { count: 2, short: false },
      "9-16": { count: 1, short: false },
    });
    const html = Object.fromEntries(markers.map((m) => [m.key.replace("station:", ""), m.html]));
    expect(html["hw"]).toContain('title="5 Personen anwesend"');
    expect(html["9-14"]).toContain('<small class="crew" title="2 Personen anwesend">');
    expect(html["9-15"]).toContain('<small class="crew empty" title="0 Personen anwesend">');
    expect(html["9-16"]).toContain('title="1 Person anwesend"');
    expect(html["9-17"]).not.toContain("crew");
  });

  it("heben „−1“ hervor", () => {
    const state = initialState();
    state.towers["9-14"].open = true;
    const marker = stationMarkers(state, { "9-14": { count: 1, short: true } }).find((m) => m.key === "station:9-14")!;
    expect(marker.className).toBe("tower open short");
    expect(marker.html).toContain('title="1 Person anwesend, eine weniger als laut Wachplan"');
    expect(marker.html).toContain('<b class="short-badge">−1</b>');
  });
});
