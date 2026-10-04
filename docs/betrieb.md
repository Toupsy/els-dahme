# Betrieb

## Server aufsetzen

1. Server mit Docker und Docker Compose. Die Domain zeigt per DNS auf den Server, die Ports 80 und 443 sind offen.
2. Repository klonen und `.env` anlegen:

   ```bash
   git clone https://github.com/toupsy/els-dahme.git && cd els-dahme
   cp .env.example .env
   ```

3. In `.env` eintragen:
   - `PUBLIC_ORIGIN`: die Adresse mit `https://`, z. B. `https://els.example.de`
   - `SESSION_SECRET`: Ausgabe von `openssl rand -hex 32`
   - `PASSCODE_HASH`: siehe unten
4. Starten:

   ```bash
   docker compose up -d --build
   docker compose ps          # app muss „healthy“ sein
   ```

Caddy holt das Zertifikat und leitet HTTP auf HTTPS um. Die Datenbank liegt im Volume `app_data` unter `/data/els.db`.

**Update:** `git pull && docker compose up -d --build`. Migrationen laufen beim Start automatisch.

## Passcode setzen und ändern

Der Passcode steht nirgends im Klartext, nur als Hash in `PASSCODE_HASH`.

Hash erzeugen, auf einem Rechner mit Node 22 oder neuer:

```bash
node scripts/hash-passcode.mjs
# Passcode eingeben → Ausgabe: PASSCODE_HASH=scrypt:16384:8:1:…
```

Ohne Node, mit Docker:

```bash
docker run --rm -it -v "$PWD/scripts:/s:ro" node:24-slim node /s/hash-passcode.mjs
```

Die ausgegebene Zeile in `.env` übernehmen und neu starten:

```bash
docker compose up -d
```

Nach einem Wechsel sind alle bestehenden Sitzungen ungültig. Jedes Gerät fragt beim nächsten Kontakt zum Server nach dem neuen Passcode; offline erfasste Eingaben bleiben erhalten und werden danach gesendet.

Weitere Einstellungen in `.env`:

| Variable               | Bedeutung                                   | Standard |
| ---------------------- | ------------------------------------------- | -------- |
| `SESSION_TTL_HOURS`    | Gültigkeit einer Anmeldung                  | 24       |
| `LOGIN_MAX_FAILURES`   | Fehlversuche je IP im Zeitfenster, dann 429 | 5        |
| `LOGIN_WINDOW_MINUTES` | Zeitfenster für Fehlversuche                | 15       |
| `TRUST_PROXY`          | hinter Caddy `true` (echte Client-IP)       | false    |

## Sicherung

Die Sicherung läuft im laufenden Betrieb und ist konsistent (SQLite-Backup-API):

```bash
docker compose exec app node dist/backup.mjs /data/sicherung-$(date +%F).db
docker compose cp app:/data/sicherung-$(date +%F).db ./
```

Empfehlung: täglich per Cron und die Datei außerhalb des Servers aufbewahren.

**Wiederherstellen:**

```bash
docker compose stop app
docker compose run --rm --no-deps --entrypoint sh app -c 'rm -f /data/els.db-wal /data/els.db-shm'
docker compose cp ./sicherung-2026-08-16.db app:/data/els.db
docker compose start app
```

Geräte, die schon einen neueren Stand hatten, gleichen danach vollständig ab. Ihre noch nicht gesendeten Eingaben bleiben erhalten und werden erneut gesendet.

## Öffentliche Vorschau

Die Workflows `deploy-preview.yml` (main → Worker `els-dahme-demo`) und `deploy-pr-preview.yml` (Worker je PR, wird beim Schließen gelöscht) brauchen zwei Repository-Secrets:

- `CLOUDFLARE_API_TOKEN` mit dem Recht „Workers Scripts: Edit“
- `CLOUDFLARE_ACCOUNT_ID`

Fehlen sie, wird der Deploy mit einer Warnung übersprungen und die CI bleibt grün.
