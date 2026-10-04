import { describe, expect, it } from "vitest";
import {
  GEO,
  dayEndCap,
  dayStart,
  distanceM,
  formatClock,
  isWaterLocation,
  mooringPosition,
  nearestTower,
  offset,
  runningPosition,
  seaBearing,
  shiftDate,
  stationPoint,
  toIso,
  watchDate,
  watchTimeToUtc,
} from "../src";

describe("Zeit", () => {
  it("Tagesgrenzen nach Europe/Berlin, Sommer- und Winterzeit", () => {
    expect(toIso(dayStart("2026-07-01"))).toBe("2026-06-30T22:00:00.000Z");
    expect(toIso(dayStart("2026-01-15"))).toBe("2026-01-14T23:00:00.000Z");
    expect(toIso(dayEndCap("2026-07-01"))).toBe("2026-07-01T21:59:59.000Z");
    // Umstellungstage
    expect(toIso(dayStart("2026-03-29"))).toBe("2026-03-28T23:00:00.000Z");
    expect(toIso(dayEndCap("2026-03-29"))).toBe("2026-03-29T21:59:59.000Z");
    expect(toIso(dayEndCap("2026-10-25"))).toBe("2026-10-25T22:59:59.000Z");
  });

  it("Kalendertag und Uhrzeit der Wache", () => {
    expect(watchDate("2026-07-01T21:59:59.000Z")).toBe("2026-07-01");
    expect(watchDate("2026-07-01T22:00:00.000Z")).toBe("2026-07-02");
    expect(formatClock("2026-07-01T08:05:00.000Z")).toBe("10:05");
    expect(watchTimeToUtc("2026-07-01", "10:05")).toBe("2026-07-01T08:05:00.000Z");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Geo", () => {
  it("ruhende Boote liegen seewärts am Turm, fahrende weiter draußen", () => {
    const tower = stationPoint("9-14");
    expect(distanceM(tower, mooringPosition("9-14"))).toBeCloseTo(GEO.mooringOffsetM, 0);
    expect(distanceM(tower, runningPosition("9-14"))).toBeCloseTo(GEO.runningOffsetM, 0);
    expect(isWaterLocation(mooringPosition("9-14"))).toBe(true);
    expect(isWaterLocation(offset(tower, 300, seaBearing() + 180))).toBe(false);
  });

  it("mehrere Boote am selben Liegeplatz fächern auf", () => {
    expect(distanceM(mooringPosition("hw", 0, 2), mooringPosition("hw", 1, 2))).toBeCloseTo(GEO.fanM, 0);
  });

  it("nächster Turm für den Einsatztitel", () => {
    expect(nearestTower(offset(stationPoint("9-16"), 150, seaBearing()))).toBe("9-16");
  });
});
