# Architektur

```
packages/domain   Fachregeln: reine Funktionen, Zod-Schemas, Reducer
apps/server       Fastify + better-sqlite3: Login, Sync, Auslieferung der PWA
apps/web          React-PWA: IndexedDB, Outbox, Oberfläche
worker            Cloudflare Worker für die öffentliche Vorschau
```

## Fachregeln an einer Stelle

Alle Fachregeln stehen in `packages/domain`. Die Funktionen bekommen `now` übergeben und haben keine Seiteneffekte. Browser und Server importieren dieselben Funktionen, etwa Reducer, Bootstagebuch, Besetzung und Einsatzregeln.

Zeiten werden in UTC gespeichert, Funkzeiten in ganzen Sekunden. Tagesgrenzen gelten nach Europe/Berlin (`time.ts`).

## Schreiben nur über Aktionen

Jede Änderung ist eine Aktion (Intent) mit UUID, Geräte-ID, Erstellzeit, Typ und Daten. Der Katalog steht in `intents.ts`: Funk, Türme, Boote, Einsätze, Wachplan, Einstellungen.

Der Reducer `applyIntent(state, intent)` prüft zuerst und ändert danach. Ein Fachfehler (`DomainError`) lässt den Zustand unverändert. Automatische Funksprüche erzeugt der Reducer selbst. Ihre IDs leiten sich aus der Aktions-ID ab, deshalb bilden Gerät und Server dieselben Einträge.

**Gespeichert werden nur Fakten.** Abgeleitete Werte werden bei Bedarf berechnet:

| Wert                     | berechnet aus                                           |
| ------------------------ | ------------------------------------------------------- |
| Bootsstatus, Liegeplatz  | gültigen Funksprüchen des Boots (`deriveBoat`)          |
| Fahrten, Betriebsstunden | „Motor läuft/aus“-Funksprüchen (`boatlog.ts`)           |
| Besetzung der Stationen  | Wachplan des Tages + Umsetzen/Abwesend (`personnel.ts`) |
| Boot im Einsatz          | Zuordnungen der aktiven Einsätze                        |

Eine Korrektur im Funkbuch wirkt deshalb sofort auf Fahrten und Betriebsstunden. Die Rechnung des Bootstagebuchs entspricht der Feature-App; die Referenzwerte stehen in `packages/domain/reference/`.

Funktagebuch und Bootsbesatzung sind append-only. Korrekturen sind neue Einträge mit `correctionOf`.

## Sync

```
Browser                                     Server
outbox (IndexedDB) ── POST /api/sync/push ─▶ parseIntent → applyIntent
                                              IMMEDIATE-Transaktion:
                                              intents + radio_entries + crew_entries
log    (IndexedDB) ◀── GET /api/sync/pull ── angenommene Aktionen ab seq
```

- **Server:** Der Server führt das Protokoll `intents` (append-only, fortlaufende `seq`). Beim Start entsteht sein Zustand im Speicher durch Abspielen aller Aktionen.
  - Push ist idempotent: Dieselbe Aktion erneut liefert die frühere Quittung. Dieselbe ID mit anderem Inhalt ergibt `CONFLICT`.
  - Abgewiesene Aktionen kommen mit Meldung zurück, ohne die folgenden zu blockieren.
- **Browser:** Der Browser hält den bestätigten Stand (Log) und die Outbox. Angezeigt wird der bestätigte Stand, auf den die Outbox erneut angewendet wird.
  - Bestätigte Aktionen verlassen die Outbox in derselben IndexedDB-Transaktion, in der sie ins Log kommen.
  - Abgewiesene Aktionen erscheinen in den Einstellungen.
- **Konflikte** entscheidet die Reihenfolge am Server und der Reducer. Ein Beispiel: Zwei Geräte starten dasselbe Boot. Es gibt kein Last-Write-Wins pro Zeile.
- **Lesende Endpunkte** schreiben nie.
- Ein Cursor hinter dem Serverstand (nach einer Wiederherstellung) führt zu einem vollständigen Abgleich, die Outbox bleibt erhalten.

## Offline

Der Service Worker (Workbox) liefert die App-Shell aus dem Cache. Kartenkacheln werden beim Ansehen gespeichert. „Revier vorladen“ in den Einstellungen holt einmalig etwa 400 Kacheln (Zoom 13–17).

Alle Aktionen landen in der Outbox. Der Sync läuft bei Netzwechsel, nach jeder Aktion und alle 15 Sekunden.

## Live und Demo aus demselben Code

Das Build-Flag `VITE_DEMO=true` tauscht nur das Modul hinter `@mode` (`vite.config.ts`):

|            | Live (`src/mode/live.tsx`) | Demo (`src/mode/demo.tsx`)                       |
| ---------- | -------------------------- | ------------------------------------------------ |
| Transport  | Push/Pull mit dem Server   | Demo-Adapter: gleicher Reducer, sofort bestätigt |
| Daten      | SQLite auf dem Server      | nur IndexedDB dieses Browsers                    |
| Zugang     | Passcode, httpOnly-Sitzung | keiner, Hinweis „Demo – Daten nur lokal“         |
| Startdaten | leer                       | synthetische Beispieldaten (`demo-seed.ts`)      |

Weil der Login nur in `live.tsx` steckt, ist er im Demo-Bundle nicht enthalten. `pnpm build:preview` prüft das Bundle auf Server-URLs, Passcode- und Login-Code und bricht bei Treffern ab.

Der Worker liefert die statischen Dateien aus und beantwortet `/api/*` mit 503.

## Zugang (Live)

Der Passcode wird nur auf dem Server geprüft. Er steht als scrypt-Hash in `PASSCODE_HASH`.

Nach dem Login gibt es ein zufälliges Token im Cookie `els_session` (httpOnly, Secure, SameSite=Strict); in SQLite steht nur dessen HMAC. Die Sitzung gilt `SESSION_TTL_HOURS` (Standard 24 h) und ist an den aktuellen Passcode gebunden. Fehlversuche begrenzt der Server je IP (`LOGIN_MAX_FAILURES` je `LOGIN_WINDOW_MINUTES`).

Ohne gültige Sitzung liefern alle `/api/*` 401. Das Gerät arbeitet offline weiter; bei der nächsten Verbindung fragt die App erneut nach dem Passcode und sendet danach die Outbox.

## Datenbank

Ein Schema mit nummerierten Migrationen (`apps/server/src/migrations.ts`). Eine ausgelieferte Migration wird nie geändert.

Tabellen: `intents`, `radio_entries`, `crew_entries` (alle mit Triggern gegen UPDATE und DELETE), `sessions`, `login_failures`.
