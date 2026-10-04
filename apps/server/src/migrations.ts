/**
 * Nummerierte Migrationen. Eine einmal ausgelieferte Migration wird nie
 * geändert; Änderungen kommen als neue Nummer dazu.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "grundschema",
    sql: `
      -- Maßgebliches Protokoll aller angenommenen Aktionen.
      CREATE TABLE intents (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        body TEXT NOT NULL CHECK (json_valid(body)),
        fingerprint TEXT NOT NULL
      );
      CREATE TRIGGER intents_no_update BEFORE UPDATE ON intents BEGIN SELECT RAISE(ABORT, 'append-only'); END;
      CREATE TRIGGER intents_no_delete BEFORE DELETE ON intents BEGIN SELECT RAISE(ABORT, 'append-only'); END;

      -- Funktagebuch, lesbar für Export und Sicherung. Korrekturen sind neue Zeilen.
      CREATE TABLE radio_entries (
        id TEXT PRIMARY KEY,
        intent_seq INTEGER NOT NULL REFERENCES intents(seq),
        at TEXT NOT NULL,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        text TEXT NOT NULL,
        correction_of TEXT REFERENCES radio_entries(id),
        auto INTEGER NOT NULL CHECK (auto IN (0, 1))
      );
      CREATE INDEX radio_entries_at ON radio_entries(at);
      CREATE TRIGGER radio_no_update BEFORE UPDATE ON radio_entries BEGIN SELECT RAISE(ABORT, 'append-only'); END;
      CREATE TRIGGER radio_no_delete BEFORE DELETE ON radio_entries BEGIN SELECT RAISE(ABORT, 'append-only'); END;

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_expiry ON sessions(expires_at);

      CREATE TABLE login_failures (
        ip TEXT PRIMARY KEY,
        failures INTEGER NOT NULL,
        window_start INTEGER NOT NULL
      );
    `,
  },
];
