import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { DomainError, pushRequestSchema, type PushResult } from "@els/domain";
import { registerAuth } from "./auth";
import type { Config } from "./config";
import type { Db } from "./db";
import { createLedger } from "./ledger";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "connect-src 'self' https://tile.openstreetmap.org",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export type AppOptions = { now?: () => number };

export async function buildApp(config: Config, db: Db, options: AppOptions = {}) {
  const app = Fastify({
    logger: config.LOG_LEVEL === "silent" ? false : { level: config.LOG_LEVEL },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
  });
  const ledger = createLedger(db, (message) => app.log.warn(message));

  app.addHook("onSend", async (_request, reply) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) reply.header(key, value);
  });

  // Schreibende Anfragen nur von der eigenen Herkunft (zusätzlich zu SameSite=Strict).
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" || request.method === "HEAD") return;
    const origin = request.headers.origin;
    if (origin && origin !== new URL(config.PUBLIC_ORIGIN).origin)
      return reply.code(403).send({ message: "Fremde Herkunft." });
  });

  await app.register(cookie);
  registerAuth(app, config, db, options.now);

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/sync/pull", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = z
      .object({
        since: z.coerce.number().int().nonnegative().default(0),
        limit: z.coerce.number().int().min(1).max(500).default(500),
      })
      .safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Ungültige Abfrage." });
    try {
      return ledger.pull(query.data.since, query.data.limit);
    } catch (error) {
      if (error instanceof DomainError) return reply.code(409).send({ message: error.message });
      throw error;
    }
  });

  app.post("/api/sync/push", async (request, reply): Promise<PushResult | undefined> => {
    reply.header("Cache-Control", "no-store");
    const body = pushRequestSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ message: "Ungültige Anfrage." });
      return;
    }
    const result: PushResult = { acknowledged: [], failed: [] };
    for (const [index, input] of body.data.intents.entries()) {
      const id = typeof (input as { id?: unknown })?.id === "string" ? (input as { id: string }).id : null;
      try {
        result.acknowledged.push(ledger.apply(input));
      } catch (error) {
        if (error instanceof DomainError) result.failed.push({ index, id, code: error.code, message: error.message });
        else {
          request.log.error({ err: error }, "Aktion nicht gespeichert");
          result.failed.push({ index, id, code: "SERVER_ERROR", message: "Aktion nicht gespeichert. Wird erneut gesendet." });
        }
      }
    }
    return result;
  });

  const webRoot = resolve(config.WEB_DIST);
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
      setHeaders: (res, path) => {
        if (path.endsWith("sw.js") || path.endsWith(".html") || path.endsWith(".webmanifest"))
          res.setHeader("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.method !== "GET")
        return reply.code(404).send({ message: "Nicht gefunden." });
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    });
  }

  return { app, ledger };
}
