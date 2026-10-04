// Prüft den Demo-Build auf Dinge, die dort nichts zu suchen haben:
// Server-Adressen, Passcode/Login-Code, Sitzungs- und Geheimnis-Namen.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const FORBIDDEN = [
  { pattern: /\/api\/(login|logout|session|sync)/, reason: "Server-API-Pfad" },
  { pattern: /passcode/i, reason: "Passcode/Login-Code" },
  { pattern: /els_session/, reason: "Sitzungs-Cookie" },
  { pattern: /SESSION_SECRET|PASSCODE_HASH|PUBLIC_ORIGIN/, reason: "Server-Konfiguration" },
  { pattern: /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, reason: "Server-URL" },
  { pattern: /scrypt:\d+:/, reason: "Passcode-Hash" },
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

export function findForbidden(dir) {
  const hits = [];
  for (const file of files(dir)) {
    if (!/\.(js|mjs|html|css|json|webmanifest|map)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const { pattern, reason } of FORBIDDEN) {
      const match = pattern.exec(text);
      if (match) hits.push({ file, reason, match: match[0] });
    }
  }
  return hits;
}
