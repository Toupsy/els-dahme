import { z } from "zod";
import { BOAT_PURPOSES } from "./funk";
import { INCIDENT_EVENTS, INCIDENT_KINDS, INCIDENT_OUTCOMES } from "./incidents";
import { ROSTER_ROLES } from "./roster";
import { BOAT_IDS, STATION_IDS, type StationId } from "./stations";
import { isUtcTimestamp } from "./time";

export const utcTimestampSchema = z.string().refine(isUtcTimestamp, "Zeitstempel muss UTC im ISO-Format sein.");

const callSign = z.string().trim().min(1).max(40);
const station = z.enum(STATION_IDS as [StationId, ...StationId[]]);
const boat = z.enum(BOAT_IDS);
const date = z.iso.date();
const personName = z.string().trim().min(1).max(120);
export const FLAGS = ["", "gelb", "windsack", "gelb_windsack", "rot"] as const;
const radioText = z.string().trim().min(1).max(500);

const envelope = {
  id: z.uuid(),
  deviceId: z.uuid(),
  createdAt: utcTimestampSchema,
};

function intent<T extends string, D extends z.ZodType>(type: T, data: D) {
  return z.object({ ...envelope, type: z.literal(type), data });
}

export const radioAppendIntent = intent(
  "radio.append",
  z.object({ from: callSign, to: callSign, text: radioText, at: utcTimestampSchema.optional() }),
);
export const radioCorrectIntent = intent(
  "radio.correct",
  z.object({
    of: z.string().min(1).max(80),
    from: callSign,
    to: callSign,
    text: radioText,
    at: utcTimestampSchema,
  }),
);
export const settingsIntent = intent(
  "settings.update",
  z.object({ mapBearing: z.number().int().min(0).max(359) }).partial(),
);

export const towerRigUpIntent = intent("tower.rigUp", z.object({ station }));
export const towerRigDownIntent = intent("tower.rigDown", z.object({ station }));
export const towerFlagIntent = intent("tower.flag", z.object({ station, flag: z.enum(FLAGS) }));

export const boatMotorOnIntent = intent(
  "boat.motorOn",
  z.object({ boat, purpose: z.enum(BOAT_PURPOSES), target: station.nullable().default(null) }),
);
export const boatSwitchIntent = intent(
  "boat.switch",
  z.object({ boat, purpose: z.enum(BOAT_PURPOSES), target: station.nullable().default(null) }),
);
export const boatMotorOffIntent = intent(
  "boat.motorOff",
  z.object({ boat, station: station.nullable().default(null) }),
);
export const boatServiceIntent = intent("boat.service", z.object({ boat, inService: z.boolean() }));
export const boatStationIntent = intent("boat.station", z.object({ boat, station }));
export const boatHoursBaseIntent = intent(
  "boat.hoursBase",
  z.object({ boat, minutes: z.number().int().min(0).max(10_000_000), since: date.nullable() }),
);
export const boatCrewIntent = intent(
  "boat.crew",
  z.object({ boat, date, bootsfuehrer: personName, bootsgast: personName }),
);

const incidentId = z.uuid();
const point = z.object({ lat: z.number().min(53).max(56), lng: z.number().min(9).max(13) });
export const incidentOpenIntent = intent(
  "incident.open",
  z.object({ title: z.string().trim().max(120).default(""), note: z.string().trim().max(1000).default(""), point }),
);
export const incidentAssignIntent = intent(
  "incident.assign",
  z.object({
    incident: incidentId,
    resource: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("boat"), boat }),
      z.object({ kind: z.literal("tower"), station }),
      z.object({ kind: z.literal("team"), count: z.number().int().min(1).max(30) }),
    ]),
  }),
);
export const incidentReleaseIntent = intent(
  "incident.release",
  z.object({ incident: incidentId, resource: z.string().min(1).max(80) }),
);
export const incidentEventIntent = intent(
  "incident.event",
  z.object({
    incident: incidentId,
    resource: z.string().min(1).max(80).nullable().default(null),
    event: z.enum(INCIDENT_EVENTS),
  }),
);
export const incidentNoteIntent = intent(
  "incident.note",
  z.object({ incident: incidentId, text: z.string().trim().min(1).max(1000) }),
);
export const incidentCloseIntent = intent(
  "incident.close",
  z.object({
    incident: incidentId,
    head: z.object({
      kind: z.enum(INCIDENT_KINDS),
      outcome: z.enum(INCIDENT_OUTCOMES),
      persons: z.number().int().min(0).max(99),
      remark: z.string().trim().max(1000).default(""),
    }),
  }),
);

const personId = z.string().trim().min(1).max(120);
export const rosterPersonSchema = z.object({
  id: personId,
  name: personName,
  role: z.enum(ROSTER_ROLES),
  station: station.nullable(),
  boat: boat.nullable(),
});
export const rosterSetDayIntent = intent(
  "roster.setDay",
  z.object({ date, people: z.array(rosterPersonSchema).max(200) }),
);
export const personMoveIntent = intent("person.move", z.object({ date, person: personId, station }));
export const personAwayIntent = intent("person.away", z.object({ date, person: personId, away: z.boolean() }));

export const intentSchema = z.discriminatedUnion("type", [
  radioAppendIntent,
  radioCorrectIntent,
  settingsIntent,
  towerRigUpIntent,
  towerRigDownIntent,
  towerFlagIntent,
  boatMotorOnIntent,
  boatSwitchIntent,
  boatMotorOffIntent,
  boatServiceIntent,
  boatStationIntent,
  boatHoursBaseIntent,
  boatCrewIntent,
  incidentOpenIntent,
  incidentAssignIntent,
  incidentReleaseIntent,
  incidentEventIntent,
  incidentNoteIntent,
  incidentCloseIntent,
  rosterSetDayIntent,
  personMoveIntent,
  personAwayIntent,
]);

export type Intent = z.infer<typeof intentSchema>;
export type IntentType = Intent["type"];
export type IntentOf<T extends IntentType> = Extract<Intent, { type: T }>;
/** Eingabe für eine neue Aktion. Felder mit Vorgabewert dürfen fehlen. */
export type IntentInput<T extends IntentType> = Pick<
  Extract<z.input<typeof intentSchema>, { type: T }>,
  "type" | "data"
>;

/** Vom Server angenommene Aktion mit fortlaufender Nummer. */
export type AcceptedIntent = { seq: number; intent: Intent };

/** Stabile Form für Fingerabdruck und Vergleich (sortierte Schlüssel). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
