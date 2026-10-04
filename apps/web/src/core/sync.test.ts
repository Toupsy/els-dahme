import { describe, expect, it } from "vitest";
import { parseIntent, type Intent } from "@els/domain";
import { nextBatch } from "./sync";

const intent = (i: number, size = 10): Intent =>
  parseIntent({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    deviceId: "00000000-0000-4000-8000-000000000000",
    createdAt: "2026-07-01T08:00:00.000Z",
    type: "radio.append",
    data: { from: "AD", to: "Alle", text: "x".repeat(size) },
  });

describe("Push-Stapel", () => {
  it("höchstens 100 Aktionen je Push", () => {
    expect(nextBatch(Array.from({ length: 150 }, (_, i) => intent(i)))).toHaveLength(100);
  });
  it("teilt große Aktionen nach Größe, mindestens eine je Stapel", () => {
    const big = Array.from({ length: 5 }, (_, i) => intent(i, 450));
    expect(nextBatch(big).length).toBe(5);
    const huge = [intent(1, 500), intent(2, 500)].map((x) => ({
      ...x,
      data: { ...x.data, text: "y".repeat(600_000) },
    }));
    expect(nextBatch(huge as Intent[])).toHaveLength(1);
  });
});
