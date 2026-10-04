import { describe, expect, it } from "vitest";
import { activeIncidents, boatStatuses, replay } from "@els/domain";
import { demoSeed } from "./demo-seed";

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
    }
  });
});
