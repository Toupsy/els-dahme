import type { ChangeEvent, KeyboardEvent, Ref } from "react";
import { resolveCallSign } from "@els/domain";

/**
 * Rufname-Feld mit Erkennung: „781“ wird „78-1“, „hw“ wird „AD“. Sobald der Rufname eindeutig ist,
 * springt `onDone` ins nächste Feld; Mehrdeutiges bestätigen Leerzeichen, Enter oder Tab.
 */
export function CallSignInput({
  label,
  value,
  list,
  inputRef,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  list?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  const match = resolveCallSign(value);
  const known = (match.state === "exact" || match.state === "ambiguous") && match.value === value;

  function confirm(sign: string) {
    onChange(sign);
    onDone();
  }

  function change(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const m = resolveCallSign(raw);
    const recognized = m.state === "exact" || m.state === "ambiguous" ? m.value : null;
    // Leerzeichen = „fertig“.
    if (raw.endsWith(" ")) return recognized ? confirm(recognized) : onChange(raw.trimEnd());
    // Beim Löschen nicht weiterspringen, sonst lässt sich ein Rufname nicht korrigieren.
    const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete");
    if (m.state === "exact" && !deleting) return confirm(m.value);
    onChange(raw);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key !== "Enter" && e.key !== "Tab") || e.shiftKey) return;
    if (match.state !== "exact" && match.state !== "ambiguous") return;
    e.preventDefault();
    confirm(match.value);
  }

  return (
    <input
      ref={inputRef}
      aria-label={label}
      className={known ? "call ok" : match.state === "unknown" ? "call bad" : "call"}
      list={list}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={change}
      onKeyDown={keyDown}
    />
  );
}
