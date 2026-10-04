# ELS Dahme

Einsatzleitsystem für den Wachdienst der DLRG Dahme. Die App zeigt die Lage auf der Karte (Türme, Hauptwache, Boote, Einsätze) und führt Funktagebuch, Bootstagebuch, Einsätze und den Wachplan. Sie ist eine PWA für Tablets und lässt sich vollständig offline bedienen; die Daten gleichen sich ab, sobald wieder Netz da ist.

**Öffentliche Demo:** https://els-dahme-demo.yannis-c30.workers.dev – ohne Anmeldung, mit Beispieldaten. Änderungen bleiben nur im eigenen Browser.

## Installation (Live)

Voraussetzungen: ein Server mit Docker und Docker Compose, eine Domain, die auf den Server zeigt, Ports 80 und 443 offen.

```bash
git clone https://github.com/toupsy/els-dahme.git && cd els-dahme
cp .env.example .env
node scripts/hash-passcode.mjs        # Passcode eingeben, Ausgabe in .env eintragen
openssl rand -hex 32                  # als SESSION_SECRET in .env eintragen
# PUBLIC_ORIGIN in .env auf die eigene Domain setzen
docker compose up -d --build
```

Caddy holt das HTTPS-Zertifikat automatisch. Betrieb, Passcode-Wechsel und Sicherung: [docs/betrieb.md](docs/betrieb.md).

## Bedienung in Kürze

- **Lage:** Turm, Boot oder Einsatz antippen; die passenden Knöpfe öffnen sich als Popup über der Karte. Rechts neben der Karte stehen das Funktagebuch des Tages (mit Eingabe) und ein Notizblock, der nur auf dem jeweiligen Gerät gespeichert wird. „Einsatz anlegen“ und dann den Ort antippen (oder lange auf die Karte drücken). „Norden oben“ schaltet die Ausrichtung um; Standard ist Seeseite oben.
- **Türme:** Aufrödeln und Abrödeln mit einem Tipp, Flagge setzen. Beim Abrödeln wird die Flagge eingeholt.
- **Boote:** „Motor läuft, <Zweck>“ bzw. „Motor aus“. Jede Änderung schreibt den Funkspruch. Verlegung: „Verlegung …“, dann das Ziel wählen.
- **Bootstagebuch:** im Tab Boote je Tag, mit Betriebsstunden (Einsatztag, Übertrag, Gesamt) und Tagebuch-Blatt zum Drucken. Den Stand aus dem Papierbuch trägt man einmal unter „Übertrag …“ ein.
- **Einsätze:** Kräfte zuordnen (ein Boot startet dabei die Einsatzfahrt), Lagemeldungen, Notizen, Abschluss mit Kopfdaten.
- **Funk:** Schnelleingabe wie „78-1 Motor läuft, Kontrollfahrt“. Korrekturen werden als neuer Eintrag gespeichert.
- **Personal:** Besetzung je Station; Wachplan als CSV oder XLSX einlesen, Vorschau prüfen, übernehmen.
- Der **Sync-Stand** steht oben rechts. Antippen gleicht sofort ab.

## Entwicklung

Für den Entwicklungsserver eine `.env` mit `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:5173`, `SESSION_SECRET` und `PASSCODE_HASH` anlegen.

```bash
pnpm install
pnpm dev             # Server auf :3000, Vite auf :5173 (leitet /api weiter)
pnpm lint && pnpm typecheck && pnpm test
pnpm build           # Live-Build (PWA + Server)
pnpm build:preview   # Demo-Build für die Vorschau
pnpm test:e2e        # Playwright gegen Demo- und Live-Build (vorher beide bauen)
```

Aufbau und Regeln: [docs/architektur.md](docs/architektur.md).
