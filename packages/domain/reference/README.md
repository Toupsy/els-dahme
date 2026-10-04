# Referenzwerte Bootstagebuch

`feature-app-boat-hours.json` enthält Szenarien aus `scenarios.json` und die Ergebnisse des Originalcodes der Feature-App (`toupsy/dahme-feature-yannis`):

- `ref.php` – `php/main/boat_hours.php` und die Rechnung von `GET /api/boats/hours` (Einsatztag, Übertrag, Gesamt)
- `ref.cjs` – `computeBoatTrips`, `ftSpanMs`, `ftTripMinutes` aus `els/scripts/funktagebuch.js` (Fahrten des Tages)

Neu erzeugen (Feature-App unter `/home/user/dahme-feature-yannis`):

```bash
php ref.php > php-out.json
TZ=Europe/Berlin node ref.cjs > js-out.json
node combine.mjs
```

Bekannte Abweichung in der Feature-App selbst: Der Boote-Tab rundet den Einsatztag aus der Summe der Sekunden (`ftTripMinutes(totalMs)`), der Server rundet je Fahrt. Diese App rundet überall je Fahrt, wie Papierbuch und Übertrag (Szenario „Rundung je Fahrt, dann Summe“: 30 statt 31 min).
