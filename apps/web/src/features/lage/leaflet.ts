import L from "leaflet";

// leaflet-rotate erweitert das globale L. Dieses Modul muss vor dem Plugin geladen werden.
(globalThis as unknown as { L: typeof L }).L = L;

export { L };
