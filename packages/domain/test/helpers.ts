import {
  applyIntent,
  initialState,
  parseIntent,
  type Intent,
  type IntentInput,
  type IntentType,
  type State,
} from "../src";

let counter = 0;
const DEVICE = "00000000-0000-4000-8000-000000000001";

/** Erzeugt eine gültige Aktion mit fortlaufender UUID. */
export function make<T extends IntentType>(createdAt: string, input: IntentInput<T>): Intent {
  counter++;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return parseIntent({ id, deviceId: DEVICE, createdAt, ...input });
}

/** Wendet Aktionen nacheinander an (wirft bei Fachfehlern). */
export function run(steps: [string, IntentInput<IntentType>][], base: State = initialState()): State {
  return steps.reduce((state, [at, input]) => applyIntent(state, make(at, input)), base);
}
