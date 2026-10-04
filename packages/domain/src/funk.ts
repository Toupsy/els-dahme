import { HQ_CALL_SIGN, RADIO_CALL_SIGNS, STATIONS, stationOfCallSign, type StationId } from "./stations";

/** Fahrtzwecke in der Schreibweise der Funksprüche („Motor läuft, <Zweck>“). */
export const BOAT_PURPOSES = [
  "Kontrollfahrt",
  "Einsatzfahrt",
  "Probefahrt",
  "Ausbildungsfahrt",
  "Verlegungsfahrt",
  "Materialtransport",
  "Abrödelfahrt",
] as const;
export type BoatPurpose = (typeof BOAT_PURPOSES)[number];

/** Spalte „Einsatzzweck“ im DLRG-Bootstagebuch. */
const PURPOSE_BOOK: Record<BoatPurpose, string> = {
  Kontrollfahrt: "Kontrollfahrt",
  Einsatzfahrt: "Einsatz",
  Probefahrt: "Probefahrt",
  Ausbildungsfahrt: "Ausbildung",
  Verlegungsfahrt: "Verlegung",
  Materialtransport: "MT",
  Abrödelfahrt: "Abrödeln",
};

export function purposeInBook(reason: string): string {
  const r = reason.trim();
  for (const [app, book] of Object.entries(PURPOSE_BOOK)) {
    if (r === app) return book;
    if (r.startsWith(`${app} `)) return book + r.slice(app.length);
  }
  return r;
}

/** Standardtexte nach dem DLRG-Referenzblatt (Vorschläge im Funktagebuch). */
export const STANDARD_TEXTS = [
  "Funk-Anmeldung",
  "Funk-Abmeldung",
  ...BOAT_PURPOSES.map((p) => `Motor läuft, ${p}`),
  "Motor aus, E-klar Strand",
  "Motor aus, E-klar Brücke",
  "Motor aus, an der Hauptwache",
  "Motor aus, nicht mehr E-klar",
  "Eintreffen Einsatzstelle",
  "Person aufgenommen",
  "Person an Land übergeben",
  "Turm aufgerödelt, E-klar",
  "Turm abgerödelt, nicht mehr E-klar",
  "Funkanmeldung, Wachbetrieb aufgenommen",
  "Funkabmeldung, Wachbetrieb beendet",
  "Freiwache zum Strand",
  "Einholen Wetterdaten",
  "Wasser: __°C, Luft: __°C, Wind: __ __, Luftdruck: ____ hPa",
] as const;

const MOTOR_ON = "Motor läuft, ";
const MOTOR_OFF = "Motor aus";
const SWITCH = "Fahrtwechsel, ";
const SWITCH_TEXTS: Record<string, string> = {
  "Einsatzfahrt aufgenommen": "Einsatzfahrt",
  "Zurück zu Kontrollfahrt": "Kontrollfahrt",
};

export type MotorMessage = { kind: "start" | "change"; reason: string } | { kind: "stop" } | { kind: "none" };

/**
 * Nur diese Präfixe verändern die Motorzeit (wie in der Feature-App).
 * „Fahrtwechsel“ und die beiden Kurzformen sind Abschnitte derselben Fahrt.
 */
export function classifyMotorMessage(text: string): MotorMessage {
  const t = text.trim();
  if (t.startsWith(MOTOR_ON)) return { kind: "start", reason: t.slice(MOTOR_ON.length).trim() || "Fahrt" };
  if (t.startsWith(MOTOR_OFF)) return { kind: "stop" };
  if (t.startsWith(SWITCH)) return { kind: "change", reason: t.slice(SWITCH.length).trim() || "Fahrt" };
  const short = SWITCH_TEXTS[t];
  return short ? { kind: "change", reason: short } : { kind: "none" };
}

/** „Verlegungsfahrt nach 9-14“ → Zweck + Ziel. */
export function splitReason(reason: string): { purpose: string; target: StationId | null } {
  const match = /^(.*?) nach (.+)$/.exec(reason.trim());
  if (!match) return { purpose: reason.trim(), target: null };
  const target = stationOfLabel(match[2]!);
  return target ? { purpose: match[1]!, target } : { purpose: reason.trim(), target: null };
}

function stationOfLabel(label: string): StationId | null {
  const l = label.trim();
  if (l === "Hauptwache") return "hw";
  return stationOfCallSign(l) ?? (Object.keys(STATIONS) as StationId[]).find((id) => STATIONS[id].label === l) ?? null;
}

/** Liegeplatz aus „Motor aus, E-klar 9-14“ bzw. „Motor aus, an der Hauptwache“; sonst null (Standort bleibt). */
export function stopStation(text: string): StationId | null {
  const t = text.trim();
  if (/^Motor aus, an der Hauptwache\b/.test(t)) return "hw";
  const match = /^Motor aus, E-klar (\S+)/.exec(t);
  return match ? stationOfLabel(match[1]!) : null;
}

export function stationRadio(id: StationId): string {
  return STATIONS[id].radio;
}

/* ── Automatische Funksprüche ────────────────────────────────────────────── */

const at = (target: StationId | null) => (target ? ` nach ${STATIONS[target].label}` : "");

export const AUTO = {
  motorOn: (purpose: string, target: StationId | null) => `${MOTOR_ON}${purpose}${at(target)}`,
  switchTo(from: string, purpose: string, target: StationId | null) {
    if (!target && purpose === "Einsatzfahrt") return "Einsatzfahrt aufgenommen";
    if (!target && purpose === "Kontrollfahrt" && from === "Einsatzfahrt") return "Zurück zu Kontrollfahrt";
    return `${SWITCH}${purpose}${at(target)}`;
  },
  motorOff(station: StationId, moved: boolean) {
    if (station === "hw") return "Motor aus, an der Hauptwache";
    return moved ? `Motor aus, E-klar ${STATIONS[station].label}` : "Motor aus, E-klar Strand";
  },
  outOfService: () => "Außer Dienst, nicht mehr E-klar",
  inService: () => "Wieder in Dienst, E-klar",
  rigUp: () => "Turm aufgerödelt, E-klar",
  rigDown: () => "Turm abgerödelt, nicht mehr E-klar",
  flag(flag: string) {
    return (
      {
        gelb: "Flagge Gelb gesetzt",
        windsack: "Windsack gesetzt",
        gelb_windsack: "Flagge Gelb und Windsack gesetzt",
        rot: "Flagge Rot gesetzt",
      }[flag] ?? "Beflaggung eingeholt"
    );
  },
};

/* ── Schnelleingabe „78-1 Motor läuft, Kontrollfahrt“ ────────────────────── */

function normalizeCallSign(token: string): string | null {
  const t = token.replace(/[.,:;]+$/, "");
  const up = t.toUpperCase();
  if (up === "AD" || up === "HW") return HQ_CALL_SIGN;
  if (up === "ALLE") return "Alle";
  if (up === "LEITSTELLE") return "Leitstelle";
  if (/^\d{1,2}[-/]\d{1,2}$/.test(up)) {
    // Zahlendreher abfangen: „87-1“ → „78-1“ (wie in der Feature-App).
    const sign = up.replace("/", "-").replace(/^87-/, "78-");
    return (RADIO_CALL_SIGNS as readonly string[]).includes(sign) ? sign : null;
  }
  return null;
}

/**
 * Erkennt Rufnamen am Anfang. Ein Rufname → an die Hauptwache (AD → Alle).
 * Ohne erkannten Rufnamen: null.
 */
export function parseQuickRadio(input: string): { from: string; to: string; text: string } | null {
  const tokens = input.trim().split(/\s+/);
  const first = tokens[0] ? normalizeCallSign(tokens[0]) : null;
  if (!first) return null;
  const second = tokens[1] ? normalizeCallSign(tokens[1]) : null;
  return {
    from: first,
    to: second ?? (first === HQ_CALL_SIGN ? "Alle" : HQ_CALL_SIGN),
    text: tokens.slice(second ? 2 : 1).join(" "),
  };
}
