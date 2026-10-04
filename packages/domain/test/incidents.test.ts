import { describe, expect, it } from "vitest";
import { activeIncidents, boatStatuses, incidentOfBoat, offset, seaBearing, stationPoint, type State } from "../src";
import { make, run } from "./helpers";
import { applyIntent } from "../src";

const T = (hm: string) => `2026-07-01T${hm}:00.000Z`;
const point = offset(stationPoint("9-15"), 120, seaBearing());

function opened(): { state: State; id: string } {
  const intent = make(T("10:00"), {
    type: "incident.open",
    data: { title: "", note: "Schwimmer\nruft um Hilfe", point },
  });
  return {
    state: applyIntent(run([[T("07:00"), { type: "tower.rigUp", data: { station: "9-15" } }]]), intent),
    id: intent.id,
  };
}

describe("Einsätze", () => {
  it("Eröffnen: Titel nach nächstem Turm, Tagesnummer, Funkspruch mit Notiz", () => {
    const { state, id } = opened();
    expect(state.incidents[id]).toMatchObject({ number: 1, title: "9-15", station: "9-15", closedAt: null });
    expect(state.radio.at(-1)!.text).toBe("Einsatz 1 eröffnet: 9-15 – Schwimmer ruft um Hilfe");
    const second = run([[T("10:05"), { type: "incident.open", data: { title: "Suche", point } }]], state);
    expect(activeIncidents(second).map((i) => i.number)).toEqual([1, 2]);
  });

  it("Boot zuordnen startet die Einsatzfahrt bzw. wechselt die laufende Fahrt", () => {
    const start = opened();
    const id = start.id;
    let state = start.state;
    state = run(
      [[T("10:01"), { type: "incident.assign", data: { incident: id, resource: { kind: "boat", boat: "78-2" } } }]],
      state,
    );
    expect(state.radio.slice(-2).map((r) => [r.from, r.text])).toEqual([
      ["AD", "Einsatz 1 (9-15): Boot 78-2 alarmiert"],
      ["78-2", "Motor läuft, Einsatzfahrt"],
    ]);
    expect(boatStatuses(state)["78-2"].running?.purpose).toBe("Einsatzfahrt");
    expect(incidentOfBoat(state, "78-2")?.id).toBe(id);

    state = run([[T("10:02"), { type: "boat.motorOn", data: { boat: "78-1", purpose: "Kontrollfahrt" } }]], state);
    state = run(
      [[T("10:03"), { type: "incident.assign", data: { incident: id, resource: { kind: "boat", boat: "78-1" } } }]],
      state,
    );
    expect(state.radio.at(-1)!.text).toBe("Einsatzfahrt aufgenommen");
    expect(() =>
      run(
        [[T("10:04"), { type: "incident.assign", data: { incident: id, resource: { kind: "boat", boat: "78-1" } } }]],
        state,
      ),
    ).toThrow(/bereits einem Einsatz/);
  });

  it("Lagemeldungen stehen in Zeitachse und Funk, ohne die Motorzeit zu ändern", () => {
    const start = opened();
    const id = start.id;
    let state = start.state;
    state = run(
      [[T("10:01"), { type: "incident.assign", data: { incident: id, resource: { kind: "boat", boat: "78-2" } } }]],
      state,
    );
    const boatResource = state.incidents[id]!.resources[0]!.id;
    state = run(
      [
        [
          T("10:06"),
          { type: "incident.event", data: { incident: id, resource: boatResource, event: "Eintreffen Einsatzstelle" } },
        ],
        [
          T("10:09"),
          { type: "incident.event", data: { incident: id, resource: boatResource, event: "Person aufgenommen" } },
        ],
        [T("10:10"), { type: "incident.note", data: { incident: id, text: "RTW angefordert" } }],
      ],
      state,
    );
    expect(state.incidents[id]!.timeline.map((t) => t.text)).toEqual([
      "Einsatz eröffnet",
      "Boot 78-2 alarmiert",
      "Boot 78-2: Eintreffen Einsatzstelle",
      "Boot 78-2: Person aufgenommen",
      "RTW angefordert",
    ]);
    expect(boatStatuses(state)["78-2"].running?.since).toBe(T("10:01"));
  });

  it("Turm und Kräfte der HW; Entlassen meldet die Kräfte zurück", () => {
    const start = opened();
    const id = start.id;
    let state = start.state;
    expect(() =>
      run(
        [
          [
            T("10:01"),
            { type: "incident.assign", data: { incident: id, resource: { kind: "tower", station: "9-16" } } },
          ],
        ],
        state,
      ),
    ).toThrow(/nicht besetzt/);
    state = run(
      [
        [T("10:01"), { type: "incident.assign", data: { incident: id, resource: { kind: "tower", station: "9-15" } } }],
        [T("10:02"), { type: "incident.assign", data: { incident: id, resource: { kind: "team", count: 3 } } }],
      ],
      state,
    );
    const team = state.incidents[id]!.resources[1]!;
    state = run([[T("10:30"), { type: "incident.release", data: { incident: id, resource: team.id } }]], state);
    expect(state.radio.at(-1)!.text).toBe("Einsatz 1 (9-15): 3 Kräfte HW zurück an der HW");
    expect(() =>
      run([[T("10:31"), { type: "incident.release", data: { incident: id, resource: team.id } }]], state),
    ).toThrow(/bereits zurück/);
  });

  it("Abschluss mit Kopfdaten entlässt alle Kräfte; das Boot fährt weiter bis Motor aus", () => {
    const start = opened();
    const id = start.id;
    let state = start.state;
    state = run(
      [
        [T("10:01"), { type: "incident.assign", data: { incident: id, resource: { kind: "boat", boat: "78-2" } } }],
        [
          T("10:40"),
          {
            type: "incident.close",
            data: { incident: id, head: { kind: "Schwimmer in Not", outcome: "Erledigt", persons: 1, remark: "" } },
          },
        ],
      ],
      state,
    );
    const incident = state.incidents[id]!;
    expect(incident.closedAt).toBe(T("10:40"));
    expect(incident.resources.every((r) => r.releasedAt)).toBe(true);
    expect(incidentOfBoat(state, "78-2")).toBeNull();
    expect(boatStatuses(state)["78-2"].running).not.toBeNull();
    expect(state.radio.at(-1)!.text).toBe("Einsatz 1 (9-15) beendet: Erledigt");
    expect(() => run([[T("10:41"), { type: "incident.note", data: { incident: id, text: "x" } }]], state)).toThrow(
      /abgeschlossen/,
    );
  });
});
