// Isolierter Browser-Test: echte ELS-HTTP-App, synthetischer Wachplan-Vertrag.
// Keine Verbindung zu Produktion und keine echten Konten.
import { createServer, request as httpRequest } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sessions = new Map();
let failLogout = false;
const hash = execFileSync("node", ["scripts/hash-passcode.mjs"], { input: "portal-tablet-test", encoding: "utf8" })
  .trim()
  .replace(/^PASSCODE_HASH=/, "");
const child = spawn(process.execPath, ["apps/server/dist/index.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: "4177",
    HOST: "127.0.0.1",
    LOG_LEVEL: "warn",
    PUBLIC_ORIGIN: "http://127.0.0.1:4176",
    DATABASE_PATH: join(tmpdir(), `els-portal-${process.pid}.db`),
    SESSION_SECRET: "isolated-browser-fixture-".repeat(3),
    PASSCODE_HASH: hash,
    WEB_DIST: "apps/web/dist",
    PORTAL_ENABLED: "true",
    WACHPLAN_URL: "http://127.0.0.1:4176/upstream",
    WACHPLAN_PUBLIC_URL: "/plan/",
    WACHPLAN_KEY: "fixture-key-".repeat(4),
  },
});
const server = createServer(async (req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const token = decodeURIComponent(/(?:^|;\s*)wachplan\.sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "");
  if (req.url === "/__fixture/fail-logout") {
    failLogout = true;
    return json(200, { ok: true });
  }
  if (req.url === "/plan/api/auth/login" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (!["planer", "ohne-plan"].includes(body.username) || body.password !== "synthetisches-passwort")
      return json(401, { error: "Anmeldung fehlgeschlagen" });
    const sid = randomUUID();
    sessions.set(sid, body.username);
    res.setHeader("Set-Cookie", `wachplan.sid=${sid}; Path=/; Secure; HttpOnly; SameSite=Lax`);
    return json(200, { user: { username: body.username } });
  }
  if (req.url === "/plan/api/auth/me")
    return json(sessions.has(token) ? 200 : 401, { user: { username: sessions.get(token) } });
  if (req.url === "/upstream/api/els/user") {
    if (req.headers.authorization !== `Bearer ${"fixture-key-".repeat(4)}`)
      return json(403, { error: "Schlüssel falsch" });
    if (!sessions.has(token)) return json(401, { error: "Sitzung abgelaufen" });
    if (sessions.get(token) === "ohne-plan") return json(403, { error: "Kein Zugriff auf diesen Plan" });
    return json(200, { username: sessions.get(token) });
  }
  if (req.url === "/upstream/api/auth/logout" && req.method === "POST") {
    if (failLogout) {
      failLogout = false;
      return json(503, { error: "Synthetischer Ausfall" });
    }
    sessions.delete(token);
    return json(200, { ok: true });
  }
  if (req.url === "/plan/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(
      '<html lang="de"><title>Wachplan-Testvertrag</title><a href="/els/">ELS öffnen</a><p>Synthetischer Wachplan-Vertrag, keine echte Wachplan-Oberfläche.</p></html>',
    );
  }
  const proxy = httpRequest(
    { hostname: "127.0.0.1", port: 4177, path: req.url, method: req.method, headers: req.headers },
    (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(503);
    res.end();
  });
  req.pipe(proxy);
});
server.listen(4176, "127.0.0.1");
function stop() {
  child.kill();
  server.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
