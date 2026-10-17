import { z } from "zod";
import { planTarget, type RosterPerson, type RosterRole } from "./roster";

/**
 * Direkte Anbindung an den Wachplan-Generator (dort SPEC §7.5). Der Server holt
 * die Besetzung ab und legt daraus `roster.setDay` an. Der Wachplan liefert nur
 * Datum, Platz, Funktion und Name; die Personen-ID ist seine UUID, damit
 * Umsetzen und Abwesend eine erneute Lieferung überstehen.
 */

const DUTY_SLOTS = ["tower", "captain", "crew", "lead", "guard", "standby"] as const;

export const wachplanDutySchema = z.object({
  plan: z.string(),
  revision: z.number().int(),
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        people: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(120),
              name: z.string().trim().min(1).max(120),
              role: z.enum(["F", "B", "W"]),
              slot: z.enum(DUTY_SLOTS),
              code: z.string().max(40),
            }),
          )
          .max(200),
      }),
    )
    .max(31),
});
export type WachplanDuty = z.infer<typeof wachplanDutySchema>;
export type WachplanDutyDay = WachplanDuty["days"][number];
type DutyPerson = WachplanDutyDay["people"][number];

const FUNCTION_ROLE: Record<DutyPerson["role"], RosterRole> = { F: "WF", B: "BF", W: "WG" };

/** Am Boot und an der HW zählt der Platz, auf dem Turm die Funktion der Person. */
function dutyRole(p: DutyPerson): RosterRole {
  if (p.slot === "captain") return "BF";
  if (p.slot === "crew") return "WG";
  if (p.slot === "lead") return "WF";
  if (p.slot === "guard" || p.slot === "standby") return "HW";
  return FUNCTION_ROLE[p.role];
}

/** Ein Wachplan-Tag → Besetzung im ELS. Unbekannte Kennungen und Doppelte werden gemeldet und übersprungen. */
export function rosterFromDuty(day: WachplanDutyDay): { people: RosterPerson[]; warnings: string[] } {
  const people: RosterPerson[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const p of day.people) {
    const target = planTarget("", p.code);
    const fits =
      p.slot === "tower"
        ? target?.station && target.station !== "hw"
        : p.slot === "captain" || p.slot === "crew"
          ? target?.boat
          : target?.station === "hw";
    if (!target || !fits) {
      warnings.push(`${p.name}: Kennung „${p.code}“ gibt es im ELS nicht – nicht übernommen.`);
      continue;
    }
    if (seen.has(p.id)) {
      warnings.push(`${p.name} steht doppelt im Wachplan – erster Eintrag gilt.`);
      continue;
    }
    seen.add(p.id);
    people.push({ id: p.id, name: p.name, role: dutyRole(p), ...target });
  }
  return { people, warnings };
}

/** Stand der Anbindung, wie ihn der Server meldet. */
export const wachplanStatusSchema = z.object({
  configured: z.boolean(),
  plan: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
  /** Abgerufene Tage mit Besetzung; ein fehlender Tag ist im Wachplan noch leer. */
  days: z.array(z.object({ date: z.string(), people: z.number().int() })),
});
export type WachplanStatus = z.infer<typeof wachplanStatusSchema>;
