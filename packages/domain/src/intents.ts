import { z } from "zod";
import { isUtcTimestamp } from "./time";

export const utcTimestampSchema = z
  .string()
  .refine(isUtcTimestamp, "Zeitstempel muss UTC im ISO-Format sein.");

const callSign = z.string().trim().min(1).max(40);
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

export const intentSchema = z.discriminatedUnion("type", [
  radioAppendIntent,
  radioCorrectIntent,
  settingsIntent,
]);

export type Intent = z.infer<typeof intentSchema>;
export type IntentType = Intent["type"];
export type IntentOf<T extends IntentType> = Extract<Intent, { type: T }>;
export type IntentInput<T extends IntentType> = Pick<IntentOf<T>, "type" | "data">;

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
