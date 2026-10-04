import { resolve } from "node:path";
import { openDatabase } from "./db";

/**
 * Konsistente Sicherung im laufenden Betrieb (SQLite-Backup-API).
 * Aufruf: node apps/server/dist/backup.mjs <zieldatei>
 */
const target = process.argv[2];
if (!target) {
  console.error("Aufruf: backup <zieldatei>");
  process.exit(2);
}
const db = openDatabase(process.env.DATABASE_PATH ?? "./data/els.db");
await db.backup(resolve(target));
db.close();
console.log(`Sicherung geschrieben: ${resolve(target)}`);
