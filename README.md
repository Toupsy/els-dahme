# ELS Dahme

Einsatzleitsystem für den Wachdienst der DLRG Dahme: Lage auf der Karte, Türme, Boote mit Bootstagebuch, Einsätze, Funktagebuch und Wachplan. Die App ist eine PWA und lässt sich vollständig offline bedienen.

Der Aufbau folgt [docs/architektur.md](docs/architektur.md), der Betrieb [docs/betrieb.md](docs/betrieb.md).

## Entwicklung

```bash
pnpm install
pnpm dev            # Server (Port 3000) und Vite (Port 5173)
pnpm test           # Unit- und Servertests
pnpm build:preview  # Demo-Build für die öffentliche Vorschau
```
