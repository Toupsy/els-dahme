import "./funk.css";
import { useState } from "react";
import { radioOfDay, watchDate } from "@els/domain";
import { DayBar } from "../../components/DayBar";
import { useLedger, useRuntime } from "../../core/runtime";
import { RadioForm } from "./RadioForm";
import { RadioList } from "./RadioList";

/** Funktagebuch: ein Tag zur Zeit, neueste Einträge oben. */
export function FunkPage() {
  const runtime = useRuntime();
  const { state } = useLedger();
  const [date, setDate] = useState(() => watchDate(runtime.now()));
  const entries = radioOfDay(state.radio, date).reverse();

  return (
    <div className="stack">
      <DayBar date={date} onChange={setDate} />
      <RadioForm date={date} />
      <RadioList entries={entries} />
    </div>
  );
}
