import { fail } from "./errors";
import { AUTO, stationRadio } from "./funk";
import type { IntentOf } from "./intents";
import { appendRadio } from "./radio";
import type { State } from "./state";
import { HQ_CALL_SIGN, STATIONS, TOWER_IDS } from "./stations";

export function rigUp(draft: State, intent: IntentOf<"tower.rigUp">) {
  const { station } = intent.data;
  if (station === "hw") fail("INVALID_INPUT", "Die Hauptwache ist immer besetzt.");
  if (draft.towers[station].open)
    fail("INVALID_TRANSITION", `Turm ${STATIONS[station].label} ist bereits aufgerödelt.`);
  draft.towers[station] = { ...draft.towers[station], open: true };
  appendRadio(
    draft,
    intent.id,
    0,
    { from: stationRadio(station), to: HQ_CALL_SIGN, text: AUTO.rigUp(), at: intent.createdAt },
    true,
  );
}

/** Abrödeln holt die Beflaggung ein; ist danach kein Turm mehr offen, auch die der Hauptwache. */
export function rigDown(draft: State, intent: IntentOf<"tower.rigDown">) {
  const { station } = intent.data;
  if (station === "hw") fail("INVALID_INPUT", "Die Hauptwache wird nicht abgerödelt.");
  if (!draft.towers[station].open) fail("INVALID_TRANSITION", `Turm ${STATIONS[station].label} ist nicht aufgerödelt.`);
  draft.towers[station] = { open: false, flag: "" };
  if (!TOWER_IDS.some((id) => draft.towers[id].open)) draft.towers.hw = { ...draft.towers.hw, flag: "" };
  appendRadio(
    draft,
    intent.id,
    0,
    { from: stationRadio(station), to: HQ_CALL_SIGN, text: AUTO.rigDown(), at: intent.createdAt },
    true,
  );
}

export function setFlag(draft: State, intent: IntentOf<"tower.flag">) {
  const { station, flag } = intent.data;
  const tower = draft.towers[station];
  if (!tower.open) fail("INVALID_TRANSITION", `Turm ${STATIONS[station].label} ist nicht aufgerödelt.`);
  if (tower.flag === flag) fail("INVALID_TRANSITION", "Diese Beflaggung ist bereits gesetzt.");
  draft.towers[station] = { ...tower, flag };
  appendRadio(
    draft,
    intent.id,
    0,
    {
      from: stationRadio(station),
      to: station === "hw" ? "Alle" : HQ_CALL_SIGN,
      text: AUTO.flag(flag),
      at: intent.createdAt,
    },
    true,
  );
}

export const FLAG_LABELS: Record<string, string> = {
  "": "Keine",
  gelb: "Gelb",
  windsack: "Windsack",
  gelb_windsack: "Gelb + Windsack",
  rot: "Rot",
};
