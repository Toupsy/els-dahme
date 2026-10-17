import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { readConfig } from "./config";
import { openDatabase, type Db } from "./db";
import { hashPasscode } from "./passcode";

const databases: Db[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of databases.splice(0)) db.close();
});
const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  WEB_DIST: "/nicht-vorhanden",
  PUBLIC_ORIGIN: "https://portal.example.test",
  SESSION_SECRET: "x".repeat(40),
  PASSCODE_HASH: hashPasscode("tablet-test", 1024),
  PORTAL_ENABLED: "true",
  WACHPLAN_URL: "http://wachplan:3000",
  WACHPLAN_KEY: "k".repeat(43),
  WACHPLAN_PUBLIC_URL: "/plan/",
};
async function setup() {
  let upstreamStatus = 200;
  let username = "wache";
  let logoutFails = false;
  const revoked = new Set<string>();
  const calls: { url: string; method: string; headers: Headers; redirect?: RequestRedirect }[] = [];
  const fetchImpl = (async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
    });
    const source = new Headers(init?.headers).get("cookie") ?? "";
    if (String(url).endsWith("/api/auth/logout")) {
      if (!logoutFails) revoked.add(source);
      return new Response(null, { status: logoutFails ? 503 : 200 });
    }
    if (revoked.has(source)) return Response.json({ error: "Abgemeldet" }, { status: 401 });
    return Response.json(upstreamStatus === 200 ? { username } : { error: "Kein Zugriff" }, { status: upstreamStatus });
  }) as typeof fetch;
  const db = openDatabase(":memory:");
  databases.push(db);
  const { app } = await buildApp(readConfig(env), db, { fetch: fetchImpl, now: () => Date.now() });
  const source = { "wachplan.sid": "synthetic-source-session" };
  const login = await app.inject({ method: "POST", url: "/api/login/wachplan", cookies: source, payload: {} });
  const cookies = { ...source, els_session: login.cookies.find((c) => c.name === "els_session")!.value };
  return {
    app,
    db,
    cookies,
    calls,
    deny: (status: number) => {
      upstreamStatus = status;
    },
    changeUser: () => {
      username = "andere";
    },
    failLogout: (fails = true) => {
      logoutFails = fails;
    },
  };
}
const pendingCookie = "els_pending_logout";
// Apply Set-Cookie including deletions, as a browser does before the next request.
function applyCookies(jar: Record<string, string>, response: { cookies: { name: string; value: string }[] }) {
  for (const cookie of response.cookies) {
    if (!cookie.value) delete jar[cookie.name];
    else jar[cookie.name] = cookie.value;
  }
}
describe("Gemeinsames Portal", () => {
  it("requires safe portal configuration", () => {
    for (const value of ["//evil.test/", "/\\evil.test/", "https://evil.test/", "/plan/%5cfoo", "/plan/../api/"]) {
      expect(() => readConfig({ ...env, WACHPLAN_PUBLIC_URL: value })).toThrow();
    }
    expect(() => readConfig({ ...env, WACHPLAN_KEY: "" })).toThrow();
    expect(() => readConfig(env)).not.toThrow();
  });
  it("binds account sessions to the exact source cookie and identity", async () => {
    const { app, cookies, changeUser } = await setup();
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/api/session", cookies: { ...cookies, "wachplan.sid": "other-valid-session" } }))
        .statusCode,
    ).toBe(401);
    changeUser();
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
  });
  it.each([401, 403])(
    "denies protected reads and writes after source revocation/access denial (%s)",
    async (status) => {
      const { app, cookies, deny } = await setup();
      deny(status);
      expect((await app.inject({ url: "/api/sync/pull", cookies })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: {} })).statusCode).toBe(401);
    },
  );
  it("denies an absent source and fails closed when the upstream is unavailable", async () => {
    const { app, cookies, deny } = await setup();
    expect((await app.inject({ url: "/api/session", cookies: { els_session: cookies.els_session } })).statusCode).toBe(
      401,
    );
    deny(503);
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
  });
  it("keeps newly authenticated tablet sessions independent and rejects ambiguous old sessions", async () => {
    const { app, db } = await setup();
    const login = await app.inject({ method: "POST", url: "/api/login", payload: { passcode: "tablet-test" } });
    const cookies = { els_session: login.cookies.find((c) => c.name === "els_session")!.value };
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(200);
    db.prepare("UPDATE sessions SET source = 'legacy'").run();
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
  });
  it("logs out publicly within the origin guard and forwards only the source cookie", async () => {
    const { app, cookies, calls } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/logout/portal",
      cookies: { ...cookies, foreign: "private" },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const call = calls.at(-1)!;
    expect(call.url).toBe("http://wachplan:3000/api/auth/logout");
    expect(call.method).toBe("POST");
    expect(call.headers.get("cookie")).toBe("wachplan.sid=synthetic-source-session");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.redirect).toBe("error");
    expect(response.cookies.map((c) => c.name).sort()).toEqual(["els_session", "wachplan.sid"]);
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout/portal",
          headers: { origin: "https://evil.test" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/logout/portal", payload: {} })).statusCode).toBe(200);
  });
  it("reports partial logout failure but invalidates ELS and clears both cookies", async () => {
    const { app, cookies, failLogout } = await setup();
    failLogout();
    const response = await app.inject({ method: "POST", url: "/api/logout/portal", cookies, payload: {} });
    expect(response.statusCode).toBe(502);
    expect(response.json().ok).not.toBe(true);
    expect(response.cookies.map((c) => c.name).sort()).toEqual(["els_pending_logout", "els_session", "wachplan.sid"]);
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
  });
  it("retries the original source after browser cookie deletion and repeated failures, then revokes it", async () => {
    const { app, cookies, calls, failLogout } = await setup();
    const jar: Record<string, string> = { ...cookies };
    failLogout();
    for (let i = 0; i < 3; i++) {
      const result = await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar });
      expect(result.statusCode).toBe(502);
      applyCookies(jar, result);
      expect(Object.keys(jar)).toEqual([pendingCookie]);
      expect(jar[pendingCookie]).not.toContain(cookies["wachplan.sid"]);
    }
    expect(calls.filter((c) => c.url.endsWith("/api/auth/logout"))).toHaveLength(3);
    expect((await app.inject({ url: "/api/session", cookies: jar })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/session", cookies })).statusCode).toBe(401);
    failLogout(false);
    const result = await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar });
    expect(result.statusCode).toBe(200);
    applyCookies(jar, result);
    expect(jar).toEqual({});
    expect(calls.filter((c) => c.url.endsWith("/api/auth/logout"))).toHaveLength(4);
    expect((await app.inject({ method: "POST", url: "/api/login/wachplan", cookies })).statusCode).toBe(403);
  });
  it("retains both a pending source and a fresh current source across failures", async () => {
    const { app, cookies, calls, failLogout } = await setup();
    const jar: Record<string, string> = { ...cookies };
    failLogout();
    applyCookies(jar, await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar }));
    jar["wachplan.sid"] = "fresh-synthetic-source";
    const second = await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar });
    expect(second.statusCode).toBe(502);
    applyCookies(jar, second);
    failLogout(false);
    const result = await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar });
    expect(result.statusCode).toBe(200);
    expect(calls.filter((c) => c.url.endsWith("/api/auth/logout")).map((c) => c.headers.get("cookie"))).toEqual([
      "wachplan.sid=synthetic-source-session",
      "wachplan.sid=synthetic-source-session",
      "wachplan.sid=fresh-synthetic-source",
      "wachplan.sid=synthetic-source-session",
      "wachplan.sid=fresh-synthetic-source",
    ]);
  });
  it.each(["tampered", "expired"])("never reports success for %s retry state", async (kind) => {
    const { app, cookies, failLogout } = await setup();
    const jar: Record<string, string> = { ...cookies };
    failLogout();
    applyCookies(jar, await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar }));
    if (kind === "tampered") jar[pendingCookie] = `invalid${jar[pendingCookie]}`;
    else {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 25 * 3_600_000);
    }
    failLogout(false);
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({ method: "POST", url: "/api/logout/portal", cookies: jar });
      expect(response.statusCode).toBe(502);
      expect(response.json().ok).not.toBe(true);
      applyCookies(jar, response);
      expect(jar[pendingCookie]).toBeTruthy();
    }
  });
});
