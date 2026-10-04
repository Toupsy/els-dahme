import { createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "./config";
import type { Db } from "./db";
import { verifyPasscode } from "./passcode";

export const SESSION_COOKIE = "els_session";

const loginSchema = z.object({ passcode: z.string().min(1).max(200) });

/**
 * Zugang nur mit Passcode. Geprüft wird ausschließlich hier auf dem Server.
 * Die Sitzung ist ein zufälliges Token im httpOnly-Cookie; gespeichert wird
 * nur sein HMAC.
 */
export function registerAuth(app: FastifyInstance, config: Config, db: Db, now: () => number = Date.now) {
  const ttlMs = config.SESSION_TTL_HOURS * 3_600_000;
  const windowMs = config.LOGIN_WINDOW_MINUTES * 60_000;
  const tokenHash = (token: string) => createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
  // Kennung des aktuellen Passcodes: Nach einem Wechsel sind alle alten Sitzungen ungültig.
  const passcodeTag = createHmac("sha256", config.SESSION_SECRET)
    .update(config.PASSCODE_HASH)
    .digest("hex")
    .slice(0, 16);

  const insertSession = db.prepare(
    "INSERT INTO sessions(token_hash, created_at, expires_at, passcode_tag) VALUES(?,?,?,?)",
  );
  const findSession = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ? AND passcode_tag = ?");
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const deleteExpired = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  const getFailures = db.prepare("SELECT failures, window_start FROM login_failures WHERE ip = ?");
  const putFailures = db.prepare(
    "INSERT INTO login_failures(ip, failures, window_start) VALUES(?,?,?) ON CONFLICT(ip) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start",
  );
  const clearFailures = db.prepare("DELETE FROM login_failures WHERE ip = ?");

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
  };

  function currentSession(request: FastifyRequest): { expiresAt: number } | null {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return null;
    const row = findSession.get(tokenHash(token), passcodeTag) as { expires_at: number } | undefined;
    if (!row || row.expires_at <= now()) return null;
    return { expiresAt: row.expires_at };
  }

  // Alle /api-Routen außer dem Login verlangen eine gültige Sitzung.
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/") || path === "/api/login") return;
    if (!currentSession(request))
      return reply.code(401).header("Cache-Control", "no-store").send({ message: "Anmeldung erforderlich." });
  });

  app.post("/api/login", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const ip = request.ip;
    const t = now();
    const record = getFailures.get(ip) as { failures: number; window_start: number } | undefined;
    const inWindow = record && t - record.window_start < windowMs;
    if (inWindow && record.failures >= config.LOGIN_MAX_FAILURES) {
      const retry = Math.ceil((record.window_start + windowMs - t) / 1000);
      return reply
        .code(429)
        .header("Retry-After", String(retry))
        .send({ message: "Zu viele Fehlversuche. Bitte später erneut versuchen." });
    }
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success || !verifyPasscode(parsed.data.passcode, config.PASSCODE_HASH)) {
      putFailures.run(ip, inWindow ? record.failures + 1 : 1, inWindow ? record.window_start : t);
      return reply.code(401).send({ message: "Passcode falsch." });
    }
    clearFailures.run(ip);
    deleteExpired.run(t);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = t + ttlMs;
    insertSession.run(tokenHash(token), t, expiresAt, passcodeTag);
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: new Date(expiresAt) });
    return { expiresAt: new Date(expiresAt).toISOString() };
  });

  app.post("/api/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) deleteSession.run(tokenHash(token));
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get("/api/session", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const session = currentSession(request);
    return { expiresAt: new Date(session!.expiresAt).toISOString() };
  });
}
