import { deriveBoat } from "./boats";
import { fail } from "./errors";
import { AUTO, stationRadio } from "./funk";
import { nearestTower, type Point } from "./geo";
import type { IntentOf } from "./intents";
import { appendRadio } from "./radio";
import type { State } from "./state";
import { HQ_CALL_SIGN, STATIONS, type BoatId, type StationId } from "./stations";
import { watchDate } from "./time";

export const INCIDENT_KINDS = [
  "Schwimmer in Not",
  "Badeunfall",
  "Sanitätsdienst",
  "Suche Person",
  "Suche Kind",
  "Wassersport in Not",
  "Technische Hilfe",
  "Sonstiges",
] as const;
export const INCIDENT_OUTCOMES = ["Erledigt", "Übergabe Rettungsdienst", "Fehlalarm", "Abgebrochen"] as const;
export const INCIDENT_EVENTS = [
  "Eintreffen Einsatzstelle",
  "Patient gesichert",
  "Person aufgenommen",
  "Person an Land übergeben",
] as const;

export type ResourceRef =
  { kind: "boat"; boat: BoatId } | { kind: "tower"; station: StationId } | { kind: "team"; count: number };
export type Resource = ResourceRef & { id: string; assignedAt: string; releasedAt: string | null };
export type TimelineEntry = { at: string; text: string };
export type IncidentHead = {
  kind: (typeof INCIDENT_KINDS)[number];
  outcome: (typeof INCIDENT_OUTCOMES)[number];
  persons: number;
  remark: string;
};
export type Incident = {
  id: string;
  /** Laufende Nummer des Tages. */
  number: number;
  title: string;
  note: string;
  point: Point;
  station: StationId;
  openedAt: string;
  closedAt: string | null;
  resources: Resource[];
  timeline: TimelineEntry[];
  head: IncidentHead | null;
};

export function resourceLabel(r: ResourceRef): string {
  if (r.kind === "boat") return `Boot ${r.boat}`;
  if (r.kind === "tower") return `Turm ${STATIONS[r.station].label}`;
  return `${r.count} ${r.count === 1 ? "Kraft" : "Kräfte"} HW`;
}

/** Rufname einer Ressource im Funk. */
export function resourceCallSign(r: ResourceRef): string {
  if (r.kind === "boat") return r.boat;
  if (r.kind === "tower") return stationRadio(r.station);
  return HQ_CALL_SIGN;
}

export function activeIncidents(state: State): Incident[] {
  return Object.values(state.incidents)
    .filter((i) => !i.closedAt)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
}

/** Aktiver Einsatz, dem das Boot zugeordnet ist (berechnet, nicht gespeichert). */
export function incidentOfBoat(state: State, boat: BoatId): Incident | null {
  return (
    activeIncidents(state).find((i) =>
      i.resources.some((r) => r.kind === "boat" && r.boat === boat && !r.releasedAt),
    ) ?? null
  );
}

function incidentFor(state: State, id: string): Incident {
  const incident = state.incidents[id];
  if (!incident) fail("CONFLICT", "Einsatz nicht gefunden.");
  if (incident.closedAt) fail("INVALID_TRANSITION", "Einsatz ist bereits abgeschlossen.");
  return incident;
}

const name = (i: Incident) => `Einsatz ${i.number} (${i.title})`;

export function openIncident(draft: State, intent: IntentOf<"incident.open">) {
  const { title, note, point } = intent.data;
  const date = watchDate(intent.createdAt);
  const number = Object.values(draft.incidents).filter((i) => watchDate(i.openedAt) === date).length + 1;
  const station = nearestTower(point);
  const incident: Incident = {
    id: intent.id,
    number,
    title: title || STATIONS[station].label,
    note,
    point,
    station,
    openedAt: intent.createdAt,
    closedAt: null,
    resources: [],
    timeline: [{ at: intent.createdAt, text: "Einsatz eröffnet" }],
    head: null,
  };
  draft.incidents[intent.id] = incident;
  const text = `Einsatz ${number} eröffnet: ${incident.title}${note ? ` – ${note.replace(/\s+/g, " ")}` : ""}`;
  appendRadio(draft, intent.id, 0, { from: HQ_CALL_SIGN, to: "Alle", text, at: intent.createdAt }, true);
}

/** Zuordnen eines Boots startet bzw. wechselt die Fahrt auf „Einsatzfahrt“ (mit Funkspruch des Boots). */
export function assignResource(draft: State, intent: IntentOf<"incident.assign">) {
  const incident = incidentFor(draft, intent.data.incident);
  const ref = intent.data.resource;
  const active = incident.resources.filter((r) => !r.releasedAt);
  const radio: { from: string; to: string; text: string }[] = [];
  if (ref.kind === "boat") {
    if (incidentOfBoat(draft, ref.boat))
      fail("INVALID_TRANSITION", `Boot ${ref.boat} ist bereits einem Einsatz zugeordnet.`);
    const boat = deriveBoat(draft, ref.boat);
    if (!boat.inService) fail("INVALID_TRANSITION", `Boot ${ref.boat} ist außer Dienst.`);
    if (!boat.running) radio.push({ from: ref.boat, to: HQ_CALL_SIGN, text: AUTO.motorOn("Einsatzfahrt", null) });
    else if (boat.running.purpose !== "Einsatzfahrt" || boat.running.target)
      radio.push({ from: ref.boat, to: HQ_CALL_SIGN, text: AUTO.switchTo(boat.running.purpose, "Einsatzfahrt", null) });
  } else if (ref.kind === "tower") {
    if (!draft.towers[ref.station].open)
      fail("INVALID_TRANSITION", `Turm ${STATIONS[ref.station].label} ist nicht besetzt.`);
    if (active.some((r) => r.kind === "tower" && r.station === ref.station))
      fail("INVALID_TRANSITION", "Turm ist diesem Einsatz bereits zugeordnet.");
  }
  radio.unshift({
    from: HQ_CALL_SIGN,
    to: resourceCallSign(ref),
    text: `${name(incident)}: ${resourceLabel(ref)} alarmiert`,
  });
  const resource: Resource = { ...ref, id: intent.id, assignedAt: intent.createdAt, releasedAt: null };
  draft.incidents[incident.id] = {
    ...incident,
    resources: [...incident.resources, resource],
    timeline: [...incident.timeline, { at: intent.createdAt, text: `${resourceLabel(ref)} alarmiert` }],
  };
  radio.forEach((r, i) => appendRadio(draft, intent.id, i, { ...r, at: intent.createdAt }, true));
}

function activeResource(incident: Incident, id: string): Resource {
  const resource = incident.resources.find((r) => r.id === id);
  if (!resource) fail("CONFLICT", "Kraft gehört nicht zu diesem Einsatz.");
  if (resource.releasedAt) fail("INVALID_TRANSITION", `${resourceLabel(resource)} ist bereits zurück.`);
  return resource;
}

export function releaseResource(draft: State, intent: IntentOf<"incident.release">) {
  const incident = incidentFor(draft, intent.data.incident);
  const resource = activeResource(incident, intent.data.resource);
  draft.incidents[incident.id] = {
    ...incident,
    resources: incident.resources.map((r) => (r.id === resource.id ? { ...r, releasedAt: intent.createdAt } : r)),
    timeline: [
      ...incident.timeline,
      { at: intent.createdAt, text: `${resourceLabel(resource)} aus dem Einsatz entlassen` },
    ],
  };
  if (resource.kind === "team")
    appendRadio(
      draft,
      intent.id,
      0,
      {
        from: HQ_CALL_SIGN,
        to: "Alle",
        text: `${name(incident)}: ${resourceLabel(resource)} zurück an der HW`,
        at: intent.createdAt,
      },
      true,
    );
}

/** Lagemeldung einer Kraft („Eintreffen Einsatzstelle“ …) – Funkspruch und Zeitachse. Ändert keine Motorzeit. */
export function reportEvent(draft: State, intent: IntentOf<"incident.event">) {
  const incident = incidentFor(draft, intent.data.incident);
  const resource = intent.data.resource ? activeResource(incident, intent.data.resource) : null;
  const who = resource ? resourceLabel(resource) : "Einsatzleitung";
  draft.incidents[incident.id] = {
    ...incident,
    timeline: [...incident.timeline, { at: intent.createdAt, text: `${who}: ${intent.data.event}` }],
  };
  appendRadio(
    draft,
    intent.id,
    0,
    {
      from: resource ? resourceCallSign(resource) : HQ_CALL_SIGN,
      to: HQ_CALL_SIGN,
      text: intent.data.event,
      at: intent.createdAt,
    },
    true,
  );
}

export function addNote(draft: State, intent: IntentOf<"incident.note">) {
  const incident = incidentFor(draft, intent.data.incident);
  draft.incidents[incident.id] = {
    ...incident,
    timeline: [...incident.timeline, { at: intent.createdAt, text: intent.data.text }],
  };
}

/** Abschluss mit Kopfdaten. Alle Kräfte werden entlassen; Boote fahren weiter, bis „Motor aus“ gefunkt wird. */
export function closeIncident(draft: State, intent: IntentOf<"incident.close">) {
  const incident = incidentFor(draft, intent.data.incident);
  draft.incidents[incident.id] = {
    ...incident,
    closedAt: intent.createdAt,
    head: intent.data.head,
    resources: incident.resources.map((r) => (r.releasedAt ? r : { ...r, releasedAt: intent.createdAt })),
    timeline: [
      ...incident.timeline,
      { at: intent.createdAt, text: `Einsatz abgeschlossen: ${intent.data.head.outcome}` },
    ],
  };
  appendRadio(
    draft,
    intent.id,
    0,
    {
      from: HQ_CALL_SIGN,
      to: "Alle",
      text: `${name(incident)} beendet: ${intent.data.head.outcome}`,
      at: intent.createdAt,
    },
    true,
  );
}
