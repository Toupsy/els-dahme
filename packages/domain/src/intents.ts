import { z } from "zod";
import { BOAT_PURPOSES } from "./funk";
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
