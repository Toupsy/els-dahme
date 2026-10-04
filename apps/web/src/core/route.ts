import { useEffect, useState } from "react";

export const TABS = [
  { id: "lage", label: "Lage" },
  { id: "boote", label: "Boote" },
  { id: "einsaetze", label: "Einsätze" },
  { id: "funk", label: "Funk" },
  { id: "personal", label: "Personal" },
  { id: "einstellungen", label: "Einstellungen" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export type Route = { tab: TabId; rest: string[] };

function parse(hash: string): Route {
  const [tab, ...rest] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const known = TABS.find((t) => t.id === tab);
  return { tab: known ? known.id : "lage", rest: known ? rest.map(decodeURIComponent) : [] };
}

/** Navigation über den Hash: #/boote/blatt/78-1/2026-07-01 */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function go(...parts: string[]) {
  location.hash = `#/${parts.map(encodeURIComponent).join("/")}`;
}
