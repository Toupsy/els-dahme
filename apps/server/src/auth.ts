import { createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { safePortalPath, type Config } from "./config";
import type { Db } from "./db";
import { verifyPasscode } from "./passcode";
import { WACHPLAN_SESSION_COOKIE, wachplanUser } from "./wachplan";

export const SESSION_COOKIE = "els_session";

const loginSchema = z.object({ passcode: z.string().min(1).max(200) });

/** Ohne Sitzung erreichbar: die beiden Anmeldewege und was davor zu wissen ist. */
const PUBLIC_API = new Set(["/api/login", "/api/login/options", "/api/login/wachplan"]);

/**
 * Zugang mit Passcode (Tablets) oder, wenn der Wachplan unter derselben
 * Adresse läuft, mit Wachplan-Konto (Planer). Geprüft wird ausschließlich auf
 * dem Server. Die Sitzung ist ein zufälliges Token im httpOnly-Cookie;
 * gespeichert wird nur sein HMAC.
 */
export function registerAuth(
  app: FastifyInstance,
  config: Config,
  db: Db,
  now: () => number = Date.now,
  fetchImpl: typeof fetch = fetch,
) {
  const ttlMs = config.SESSION_TTL_HOURS * 3_600_000;
  const windowMs = config.LOGIN_WINDOW_MINUTES * 60_000;
  const tokenHash = (token: string) => createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
  // Kennung des aktuellen Passcodes: Nach einem Wechsel sind alle alten Sitzungen ungültig.
  const passcodeTag = createHmac("sha256", config.SESSION_SECRET)
    .update(config.PASSCODE_HASH)
    .digest("hex")
    .slice(0, 16);

  const insertSession = db.prepare(
    "INSERT INTO sessions(token_hash, created_at, expires_at, passcode_tag, source, source_hash, username) VALUES(?,?,?,?,?,?,?)",
  );
  const findSession = db.prepare(
    "SELECT expires_at, source, source_hash, username FROM sessions WHERE token_hash = ? AND passcode_tag = ?",
  );
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

  type Session = { expires_at: number; source: string; source_hash: string | null; username: string | null };
  function currentSession(request: FastifyRequest): Session | null {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return null;
    const row = findSession.get(tokenHash(token), passcodeTag) as Session | undefined;
    if (!row || row.expires_at <= now()) return null;
    return row;
  }

  // Alle /api-Routen außer der Anmeldung verlangen eine gültige Sitzung.
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/") || PUBLIC_API.has(path) || (config.PORTAL_ENABLED && path === "/api/logout/portal"))
      return;
    const session = currentSession(request);
    let valid = !!session;
    if (session && config.PORTAL_ENABLED) {
      if (session.source === "legacy") valid = false;
      if (session.source === "wachplan") {
        const source = request.cookies[WACHPLAN_SESSION_COOKIE];
        valid = !!source && tokenHash(source) === session.source_hash;
        if (valid) {
          const user = await wachplanUser({ url: config.WACHPLAN_URL!, key: config.WACHPLAN_KEY! }, source!, fetchImpl);
          valid = user.ok && user.username === session.username;
        }
      }
    }
    if (!valid) return reply.code(401).header("Cache-Control", "no-store").send({ message: "Anmeldung erforderlich." });
  });

  /** Sekunden bis zum nächsten erlaubten Versuch, oder null. */
  function blockedFor(ip: string, t: number): number | null {
    const record = getFailures.get(ip) as { failures: number; window_start: number } | undefined;
    if (!record || t - record.window_start >= windowMs || record.failures < config.LOGIN_MAX_FAILURES) return null;
    return Math.ceil((record.window_start + windowMs - t) / 1000);
  }

  function failed(ip: string, t: number) {
    const record = getFailures.get(ip) as { failures: number; window_start: number } | undefined;
    const inWindow = record && t - record.window_start < windowMs;
    putFailures.run(ip, inWindow ? record.failures + 1 : 1, inWindow ? record.window_start : t);
  }

  function startSession(ip: string, t: number, reply: FastifyReply, sourceCookie?: string, username?: string) {
    clearFailures.run(ip);
    deleteExpired.run(t);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = t + ttlMs;
    insertSession.run(
      tokenHash(token),
      t,
      expiresAt,
      passcodeTag,
      sourceCookie ? "wachplan" : "passcode",
      sourceCookie ? tokenHash(sourceCookie) : null,
      username ?? null,
    );
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: new Date(expiresAt) });
    return { expiresAt: new Date(expiresAt).toISOString(), ...(username ? { username } : {}) };
  }

  const tooMany = (reply: FastifyReply, retry: number) =>
    reply
      .code(429)
      .header("Retry-After", String(retry))
      .send({ message: "Zu viele Fehlversuche. Bitte später erneut versuchen." });

  app.post("/api/login", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const t = now();
    const retry = blockedFor(request.ip, t);
    if (retry !== null) return tooMany(reply, retry);
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success || !verifyPasscode(parsed.data.passcode, config.PASSCODE_HASH)) {
      failed(request.ip, t);
      return reply.code(401).send({ message: "Passcode falsch." });
    }
    return startSession(request.ip, t, reply);
  });

  // Das Wachplan-Cookie kommt nur mit, wenn beide unter derselben Adresse laufen (Pfad wie /plan/).
  const wachplanLogin = !!(config.WACHPLAN_URL && config.WACHPLAN_KEY && safePortalPath(config.WACHPLAN_PUBLIC_URL));

  app.get("/api/login/options", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      ...(config.PORTAL_ENABLED ? { portal: true } : {}),
      wachplan: config.WACHPLAN_PUBLIC_URL ? { url: config.WACHPLAN_PUBLIC_URL, login: wachplanLogin } : null,
    };
  });

  app.post("/api/login/wachplan", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!wachplanLogin)
      return reply.code(404).send({ message: "Anmeldung mit Wachplan-Konto ist nicht eingerichtet." });
    const t = now();
    const retry = blockedFor(request.ip, t);
    if (retry !== null) return tooMany(reply, retry);
    const cookie = request.cookies[WACHPLAN_SESSION_COOKIE];
    if (!cookie) return reply.code(401).send({ message: "Nicht im Wachplan angemeldet." });
    const user = await wachplanUser({ url: config.WACHPLAN_URL!, key: config.WACHPLAN_KEY! }, cookie, fetchImpl);
    if (!user.ok) {
      if (user.status === 403) failed(request.ip, t);
      return reply.code(user.status).send({ message: user.message });
    }
    return startSession(request.ip, t, reply, cookie, user.username);
  });

  if (config.PORTAL_ENABLED)
    app.post("/api/logout/portal", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const token = request.cookies[SESSION_COOKIE];
      const source = request.cookies[WACHPLAN_SESSION_COOKIE];
      if (token) deleteSession.run(tokenHash(token));
      // Auch andere ELS-Sitzungen derselben Wachplan-Sitzung sofort sperren.
      if (source)
        db.prepare("DELETE FROM sessions WHERE source = 'wachplan' AND source_hash = ?").run(tokenHash(source));
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
      reply.clearCookie(WACHPLAN_SESSION_COOKIE, { ...cookieOptions, sameSite: "lax" });
      if (source) {
        try {
          const response = await fetchImpl(`${config.WACHPLAN_URL!.replace(/\/+$/, "")}/api/auth/logout`, {
            method: "POST",
            headers: { Cookie: `${WACHPLAN_SESSION_COOKIE}=${encodeURIComponent(source)}` },
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error("logout");
        } catch {
          return reply.code(502).send({
            message: "Lokal abgemeldet. Wachplan-Abmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.",
          });
        }
      }
      return { ok: true };
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
    return {
      expiresAt: new Date(session!.expires_at).toISOString(),
      ...(session!.username ? { username: session!.username } : {}),
    };
  });
}
