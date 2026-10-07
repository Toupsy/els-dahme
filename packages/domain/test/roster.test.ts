import { describe, expect, it } from "vitest";
import {
  buildRoster,
  detectDelimiter,
  dutyRoster,
  occupancy,
  parseDelimited,
  parsePlanDay,
  planTarget,
  readRosterFile,
} from "../src";
import { run } from "./helpers";
import { zip } from "./zip-helper";

/** Synthetischer Wachplan im Aufbau des Turmstatus-Exports (keine echten Namen). */
const CSV = [
  "Tag;Standort;Code;Typ;Position;Person;Rolle",
  "So., 16.08.;Hauptwache;;;Führung;Anna Alpha;WF",
  "So., 16.08.;Turm 9/14;9/14;Turm;Wachgänger;Bernd Beta;",
  "So., 16.08.;Turm 9/14;9/14;Turm;Wachgänger;Carla Gamma;",
  "So., 16.08.;Boot;Boot 78/1;Boot;Bootsführer;Dirk Delta;",
  "So., 16.08.;Turm 9/16;9/16;Turm;GESCHLOSSEN;;",
  "So., 16.08.;Turm 9/15;9/15;Turm;Wachgänger;Bernd Beta;",
  "Mo., 17.08.;Turm 9/12;9/12;Turm;Wachgänger;Erik Epsilon;",
  "Mo., 17.08.;Grömitz;;;Wachgänger;Fritz Fremd;",
  "Mo., 17.08.;HW;;;Koch;Gerd Gast;",
].join("\n");

describe("Wachplan lesen", () => {
  it("CSV mit Anführungszeichen, Trennzeichen und BOM", () => {
    expect(detectDelimiter('a;b;"c;d"\n')).toBe(";");
    expect(parseDelimited('\uFEFFTag,Person\n"16.08.","Name, Vorname"\r\n')).toEqual([
      ["Tag", "Person"],
      ["16.08.", "Name, Vorname"],
    ]);
  });

  it("Tage in allen üblichen Schreibweisen", () => {
    expect(parsePlanDay("So., 16.08.", 2026)).toBe("2026-08-16");
    expect(parsePlanDay("16.08.2025", 2026)).toBe("2025-08-16");
    expect(parsePlanDay("2026-07-01", 2025)).toBe("2026-07-01");
    expect(parsePlanDay("46250", 2026)).toBe("2026-08-16");
    expect(parsePlanDay("31.02.", 2026)).toBeNull();
  });

  it("Standorte und Boote", () => {
    expect(planTarget("Hauptwache", "")).toEqual({ station: "hw", boat: null });
    expect(planTarget("Turm", "9/14")).toEqual({ station: "9-14", boat: null });
    expect(planTarget("Boot", "Boot 78/2")).toEqual({ station: null, boat: "78-2" });
    expect(planTarget("Grömitz", "")).toBeNull();
  });

  it("Vorschau je Tag mit Hinweisen zu Unbekanntem und Doppelbelegung", () => {
    const preview = buildRoster(parseDelimited(CSV), 2026);
    expect(preview.days.map((d) => [d.date, d.people.map((p) => `${p.role}@${p.station ?? p.boat}`)])).toEqual([
      ["2026-08-16", ["WF@hw", "WG@9-14", "WG@9-14", "BF@78-1"]],
      ["2026-08-17", ["WG@9-12"]],
    ]);
    expect(preview.warnings).toEqual([
      "2026-08-16: Bernd Beta ist doppelt eingeteilt – erster Eintrag gilt.",
      "Zeile 9: Standort „Grömitz“ unbekannt – übersprungen.",
      "Zeile 10: Position „Koch“ unbekannt – übersprungen.",
    ]);
  });

  it("weist Dateien ohne erkennbare Kopfzeile ab", () => {
    expect(() => buildRoster([["a", "b"]], 2026)).toThrow(/Kopfzeile/);
  });

  it("liest XLSX und sucht die Kopfzeile", async () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Wachplan August</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c></row>
      <row r="3"><c r="A3"><v>46250</v></c><c r="B3" t="inlineStr"><is><t>9/13</t></is></c><c r="C3" t="inlineStr"><is><t>Wachgänger</t></is></c><c r="D3" t="inlineStr"><is><t>Hanna Hotel</t></is></c></row>
    </sheetData></worksheet>`;
    const bytes = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Plan" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        "<sst><si><t>Tag</t></si><si><t>Code</t></si><si><t>Position</t></si><si><t>Person</t></si></sst>",
      "xl/worksheets/sheet1.xml": sheet,
    });
    const rows = await readRosterFile("plan.xlsx", bytes);
    expect(buildRoster(rows, 2026).days).toEqual([
      {
        date: "2026-08-16",
        people: [{ id: "hanna hotel", name: "Hanna Hotel", role: "WG", station: "9-13", boat: null }],
      },
    ]);
  });
});

describe("Besetzung", () => {
  const T = (hm: string) => `2026-08-16T${hm}:00.000Z`;
  const preview = buildRoster(parseDelimited(CSV), 2026);
  const day = preview.days[0]!;
  const base = run([[T("06:00"), { type: "roster.setDay", data: { date: day.date, people: day.people } }]]);

  it("Bootsbesatzung steht dort, wo das Boot liegt", () => {
    const occ = occupancy(base, day.date);
    expect(occ["9-14"].map((p) => p.name)).toEqual(["Bernd Beta", "Carla Gamma"]);
    expect(occ["9-12"].map((p) => p.name)).toEqual(["Dirk Delta"]);
    const running = run(
      [[T("07:00"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Verlegungsfahrt", target: "9-17" } }]],
      base,
    );
    expect(occupancy(running, day.date)["9-12"]).toEqual([]);
    expect(dutyRoster(running, day.date).find((p) => p.boat === "78-1")?.onTrip).toBe(true);
    const moved = run([[T("07:20"), { type: "boat.motorOff", data: { boat: "78-1" } }]], running);
    expect(occupancy(moved, day.date)["9-17"].map((p) => p.name)).toEqual(["Dirk Delta"]);
  });

  it("Umsetzen und Abwesenheit gelten nur für den Tag", () => {
    const state = run(
      [
        [T("08:00"), { type: "person.move", data: { date: day.date, person: "carla gamma", station: "9-15" } }],
        [T("08:05"), { type: "person.away", data: { date: day.date, person: "bernd beta", away: true } }],
      ],
      base,
    );
    const occ = occupancy(state, day.date);
    expect(occ["9-14"]).toEqual([]);
    expect(occ["9-15"].map((p) => p.name)).toEqual(["Carla Gamma"]);
    expect(dutyRoster(state, day.date).find((p) => p.name === "Bernd Beta")?.away).toBe(true);
    expect(() =>
      run([[T("08:06"), { type: "person.away", data: { date: day.date, person: "bernd beta", away: true } }]], state),
    ).toThrow(/bereits abwesend/);
    expect(() =>
      run([[T("08:07"), { type: "person.move", data: { date: day.date, person: "unbekannt", station: "hw" } }]], state),
    ).toThrow(/nicht im Wachplan/);
  });

  it("Neuer Plan für den Tag ersetzt den alten und verwirft Änderungen zu entfallenen Personen", () => {
    const changed = run(
      [[T("08:00"), { type: "person.away", data: { date: day.date, person: "carla gamma", away: true } }]],
      base,
    );
    const replaced = run(
      [[T("09:00"), { type: "roster.setDay", data: { date: day.date, people: day.people.slice(0, 2) } }]],
      changed,
    );
    expect(replaced.roster[day.date]).toHaveLength(2);
    expect(replaced.rosterChanges[day.date]).toEqual({});
  });
});
