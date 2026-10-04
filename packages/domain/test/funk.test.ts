import { describe, expect, it } from "vitest";
import {
  classifyMotorMessage,
  parseQuickRadio,
  purposeInBook,
  resolveCallSign,
  splitReason,
  stopStation,
} from "../src";

describe("Funk", () => {
  it("klassifiziert Motor-Sprüche wie die Feature-App", () => {
    expect(classifyMotorMessage("Motor läuft, Kontrollfahrt")).toEqual({ kind: "start", reason: "Kontrollfahrt" });
    expect(classifyMotorMessage("Motor aus, E-klar Strand")).toEqual({ kind: "stop" });
    expect(classifyMotorMessage("Fahrtwechsel, Verlegungsfahrt nach 9-14")).toEqual({
      kind: "change",
      reason: "Verlegungsfahrt nach 9-14",
    });
    expect(classifyMotorMessage("Zurück zu Kontrollfahrt")).toEqual({ kind: "change", reason: "Kontrollfahrt" });
    expect(classifyMotorMessage("Eintreffen Einsatzstelle")).toEqual({ kind: "none" });
  });

  it("Schnelleingabe erkennt Rufnamen und Zahlendreher", () => {
    expect(parseQuickRadio("78-1 Motor läuft, Kontrollfahrt")).toEqual({
      from: "78-1",
      to: "AD",
      text: "Motor läuft, Kontrollfahrt",
    });
    expect(parseQuickRadio("AD 87-2 Motor aus")).toEqual({ from: "AD", to: "78-2", text: "Motor aus" });
    expect(parseQuickRadio("hw Alle Funkprobe")).toEqual({ from: "AD", to: "Alle", text: "Funkprobe" });
    expect(parseQuickRadio("AD Wetter")).toEqual({ from: "AD", to: "Alle", text: "Wetter" });
    expect(parseQuickRadio("Bitte kommen")).toBeNull();
  });

  it("erkennt Rufnamen beim Tippen, Trenner sind egal", () => {
    expect(resolveCallSign("")).toEqual({ state: "empty" });
    expect(resolveCallSign("7")).toEqual({ state: "prefix" });
    expect(resolveCallSign("78")).toEqual({ state: "prefix" });
    expect(resolveCallSign("78-")).toEqual({ state: "prefix" });
    expect(resolveCallSign("781")).toEqual({ state: "exact", value: "78-1" });
    expect(resolveCallSign("78.2")).toEqual({ state: "exact", value: "78-2" });
    expect(resolveCallSign("873")).toEqual({ state: "exact", value: "78-3" });
    expect(resolveCallSign("915")).toEqual({ state: "exact", value: "9-15" });
    expect(resolveCallSign("hw")).toEqual({ state: "exact", value: "AD" });
    expect(resolveCallSign("ad")).toEqual({ state: "exact", value: "AD" });
    expect(resolveCallSign("a")).toEqual({ state: "prefix" });
    expect(resolveCallSign("ALLE")).toEqual({ state: "exact", value: "Alle" });
    expect(resolveCallSign("lst")).toEqual({ state: "exact", value: "Leitstelle" });
    expect(resolveCallSign("919")).toEqual({ state: "unknown" });
    expect(resolveCallSign("x")).toEqual({ state: "unknown" });
  });

  it("liest Ziel und Liegeplatz aus dem Text", () => {
    expect(splitReason("Verlegungsfahrt nach 9-14")).toEqual({ purpose: "Verlegungsfahrt", target: "9-14" });
    expect(splitReason("Verlegungsfahrt nach HW")).toEqual({ purpose: "Verlegungsfahrt", target: "hw" });
    expect(splitReason("Fahrt nach Grömitz")).toEqual({ purpose: "Fahrt nach Grömitz", target: null });
    expect(stopStation("Motor aus, E-klar 9-17")).toBe("9-17");
    expect(stopStation("Motor aus, an der Hauptwache")).toBe("hw");
    expect(stopStation("Motor aus, E-klar Strand")).toBeNull();
    expect(purposeInBook("Materialtransport")).toBe("MT");
  });
});
