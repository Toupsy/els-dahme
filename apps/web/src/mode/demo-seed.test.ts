import { describe, expect, it } from "vitest";
import { activeIncidents, boatStatuses, buildRoster, occupancy, parseDelimited, replay, watchDate } from "@els/domain";
import { demoRosterCsv, demoSeed } from "./demo-seed";

describe("Demo-Daten", () => {
  it("sind mit dem Reducer gültig – zu jeder Tageszeit", () => {
    for (const hour of [0, 6, 12, 23]) {
      const now = Date.parse(`2026-07-15T${String(hour).padStart(2, "0")}:30:00Z`);
      const { state, rejected } = replay(demoSeed(now, crypto.randomUUID()));
      expect(rejected).toEqual([]);
      expect(boatStatuses(state)["78-1"].running?.purpose).toBe("Kontrollfahrt");
      expect(boatStatuses(state)["78-2"].station).toBe("hw");
      expect(activeIncidents(state)[0]?.resources).toHaveLength(3);
      expect(boatStatuses(state)["78-3"].running?.purpose).toBe("Einsatzfahrt");
      expect(occupancy(state, watchDate(now))["9-14"]).toHaveLength(2);
    }
  });

  it("die Beispieldatei für den Import ergibt drei Tage ohne Hinweise", () => {
    const preview = buildRoster(parseDelimited(demoRosterCsv("2026-07-15")), 2026);
    expect(preview.days.map((d) => [d.date, d.people.length])).toEqual([
      ["2026-07-16", 18],
      ["2026-07-17", 18],
      ["2026-07-18", 18],
    ]);
    expect(preview.warnings).toEqual([]);
  });
});
