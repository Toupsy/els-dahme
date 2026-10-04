import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Format: scrypt:N:r:p:salt:hash (Base64). Ohne „$“, damit Docker Compose
 * den Wert in der .env nicht als Variable auswertet. Dasselbe Verfahren nutzt
 * scripts/hash-passcode.mjs zum Erzeugen des Werts für PASSCODE_HASH.
 */
export function hashPasscode(passcode: string, N = 16384, r = 8, p = 1): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode.normalize("NFC"), salt, 32, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(passcode.normalize("NFC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * Number(n) * Number(r),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
