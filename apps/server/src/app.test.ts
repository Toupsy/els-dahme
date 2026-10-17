import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { readConfig } from "./config";
import { openDatabase, type Db } from "./db";
import { hashPasscode, verifyPasscode } from "./passcode";
import { WACHPLAN_DEVICE_ID } from "./wachplan";

const PASSCODE = "synthetischer-testcode";
const ORIGIN = "https://els.example.test";

function config(extra: Record<string, string> = {}) {
  return readConfig({
    NODE_ENV: "test",
    SESSION_SECRET: "x".repeat(40),
    PASSCODE_HASH: hashPasscode(PASSCODE, 1024),
    PUBLIC_ORIGIN: ORIGIN,
    LOG_LEVEL: "silent",
    WEB_DIST: "/nicht-vorhanden",
    ...extra,
  });
}

const open: Db[] = [];
async function setup(extra: Record<string, string> = {}, db = openDatabase(":memory:"), now?: () => number) {
  open.push(db);
  return { ...(await buildApp(config(extra), db, now ? { now } : {})), db };
}
afterEach(() => {
  while (open.length) open.pop()!.close();
});

function radioIntent(text = "Funk-Anmeldung") {
  return {
    id: randomUUID(),
    deviceId: randomUUID(),
    createdAt: "2026-07-01T08:00:00.000Z",
    type: "radio.append",
    data: { from: "9-14", to: "AD", text },
  };
}

async function login(app: Awaited<ReturnType<typeof setup>>["app"], passcode = PASSCODE) {
  return app.inject({ method: "POST", url: "/api/login", payload: { passcode } });
}

function cookieOf(response: { cookies: { name: string; value: string }[] }): Record<string, string> {
  const c = response.cookies.find((x) => x.name === "els_session");
  return c ? { els_session: c.value } : {};
}

describe("Passcode-Zugang", () => {
  it("liefert ohne Sitzung 401 auf allen API-Routen", async () => {
    const { app } = await setup();
    for (const [method, url] of [
      ["GET", "/api/sync/pull"],
      ["POST", "/api/sync/push"],
      ["GET", "/api/session"],
      ["GET", "/api/unbekannt"],
    ] as const)
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });

  it("lehnt einen falschen Passcode ab und setzt keine Sitzung", async () => {
    const { app } = await setup();
    const response = await login(app, "falsch");
    expect(response.statusCode).toBe(401);
    expect(cookieOf(response)).toEqual({});
  });

  it("gibt mit richtigem Passcode Zugriff über ein httpOnly-, Secure-, SameSite=Strict-Cookie", async () => {
    const { app } = await setup();
    const response = await login(app);
    expect(response.statusCode).toBe(200);
    const header = String(response.headers["set-cookie"]);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Strict/);
    const pull = await app.inject({ method: "GET", url: "/api/sync/pull", cookies: cookieOf(response) });
    expect(pull.statusCode).toBe(200);
    expect(pull.json()).toEqual({ intents: [], cursor: 0, hasMore: false });
  });

  it("begrenzt Fehlversuche je IP", async () => {
    const { app } = await setup({ LOGIN_MAX_FAILURES: "3" });
    for (let i = 0; i < 3; i++) expect((await login(app, "falsch")).statusCode).toBe(401);
    const blocked = await login(app);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("lässt Sitzungen nach der eingestellten Zeit ablaufen", async () => {
    let t = Date.parse("2026-07-01T08:00:00Z");
    const { app } = await setup({ SESSION_TTL_HOURS: "24" }, undefined, () => t);
    const cookies = cookieOf(await login(app));
    expect((await app.inject({ method: "GET", url: "/api/session", cookies })).statusCode).toBe(200);
    t += 24 * 3_600_000;
    expect((await app.inject({ method: "GET", url: "/api/session", cookies })).statusCode).toBe(401);
  });

  it("ein neuer Passcode macht alte Sitzungen ungültig", async () => {
    const db = openDatabase(":memory:");
    const first = await setup({}, db);
    const cookies = cookieOf(await login(first.app));
    await first.app.close();
    const second = await setup({ PASSCODE_HASH: hashPasscode("neuer-passcode-123", 1024) }, db);
    expect((await second.app.inject({ method: "GET", url: "/api/session", cookies })).statusCode).toBe(401);
  });

  it("weist schreibende Anfragen fremder Herkunft ab", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin: "https://fremd.example" },
      payload: { passcode: PASSCODE },
    });
    expect(response.statusCode).toBe(403);
  });

  it("das Hash-Skript erzeugt einen Wert, den der Server akzeptiert", () => {
    const out = execFileSync("node", ["scripts/hash-passcode.mjs"], { input: "skript-passcode", encoding: "utf8" });
    const hash = out.trim().replace(/^PASSCODE_HASH=/, "");
    expect(verifyPasscode("skript-passcode", hash)).toBe(true);
    expect(verifyPasscode("anders", hash)).toBe(false);
    expect(() => config({ PASSCODE_HASH: hash })).not.toThrow();
  });
});

describe("Sync", () => {
  it("nimmt Aktionen idempotent an und liefert sie geordnet aus", async () => {
    const { app } = await setup();
    const cookies = cookieOf(await login(app));
    const first = radioIntent("Funk-Anmeldung");
    const second = radioIntent("Turm aufgerödelt");
    const push = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      cookies,
      payload: { intents: [first, second] },
    });
    expect(push.json().acknowledged.map((a: { seq: number }) => a.seq)).toEqual([1, 2]);

    const again = await app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: { intents: [first] } });
    expect(again.json().acknowledged[0]).toMatchObject({ id: first.id, seq: 1, duplicate: true });

    const pull = await app.inject({ method: "GET", url: "/api/sync/pull?since=1", cookies });
    expect(pull.json().intents.map((i: { intent: { id: string } }) => i.intent.id)).toEqual([second.id]);
  });

  it("meldet dieselbe ID mit anderem Inhalt als Konflikt, ohne die folgenden Aktionen zu blockieren", async () => {
    const { app } = await setup();
    const cookies = cookieOf(await login(app));
    const original = radioIntent("A");
    await app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: { intents: [original] } });
    const next = radioIntent("C");
    const response = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      cookies,
      payload: { intents: [{ ...original, data: { ...original.data, text: "B" } }, { foo: 1 }, next] },
    });
    const body = response.json();
    expect(body.failed.map((f: { code: string }) => f.code)).toEqual(["CONFLICT", "INVALID_INPUT"]);
    expect(body.acknowledged.map((a: { id: string }) => a.id)).toEqual([next.id]);
  });

  it("baut den Zustand nach einem Neustart aus dem Protokoll wieder auf", async () => {
    const path = `/tmp/els-test-${randomUUID()}.db`;
    const firstDb = openDatabase(path);
    const first = await setup({}, firstDb);
    const cookies = cookieOf(await login(first.app));
    await first.app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: { intents: [radioIntent()] } });
    await first.app.close();
    firstDb.close();
    open.splice(open.indexOf(firstDb), 1);

    const second = await setup({}, openDatabase(path));
    expect(second.ledger.state.radio).toHaveLength(1);
  });

  it("schützt Protokoll, Funktagebuch und Bootsbesatzung gegen Ändern und Löschen", async () => {
    const { app, db } = await setup();
    const cookies = cookieOf(await login(app));
    await app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: { intents: [radioIntent()] } });
    expect(() => db.prepare("UPDATE radio_entries SET text = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM radio_entries").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM intents").run()).toThrow(/append-only/);
    const crew = {
      ...radioIntent(),
      type: "boat.crew",
      data: { boat: "78-1", date: "2026-07-01", bootsfuehrer: "Bootsführer A", bootsgast: "Gast B" },
    };
    await app.inject({ method: "POST", url: "/api/sync/push", cookies, payload: { intents: [crew] } });
    expect(db.prepare("SELECT boat, bootsgast FROM crew_entries").all()).toEqual([
      { boat: "78-1", bootsgast: "Gast B" },
    ]);
    expect(() => db.prepare("UPDATE crew_entries SET bootsgast = 'x'").run()).toThrow(/append-only/);
  });

  it("verlangt einen vollständigen Abgleich, wenn der Gerätestand vor dem Server liegt", async () => {
    const { app } = await setup();
    const cookies = cookieOf(await login(app));
    expect((await app.inject({ method: "GET", url: "/api/sync/pull?since=5", cookies })).statusCode).toBe(409);
  });
});

describe("Wachplan-Anbindung", () => {
  const WACHPLAN = { WACHPLAN_URL: "https://wachplan.example.test/", WACHPLAN_KEY: "k".repeat(43) };
  const NOW = Date.parse("2026-08-16T05:30:00Z");
  const person = (id: string, name: string, slot: string, code: string, role = "W") => ({ id, name, role, slot, code });
  const today = [
    person("u-1", "Anna Alpha", "lead", "HW", "F"),
    person("u-2", "Bernd Beta", "tower", "9/14"),
    person("u-3", "Dirk Delta", "captain", "78/1", "B"),
  ];
  const tomorrow = [person("u-2", "Bernd Beta", "tower", "9/15")];

  /** Nachgebauter Wachplan-Server: liefert, was in `days` steht, und merkt sich die Anfragen. */
  function fakeWachplan(days: () => { date: string; people: unknown[] }[]) {
    const calls: { url: string; auth: string | null }[] = [];
    let reply: (() => Response) | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      if (reply) return reply();
      return Response.json({ plan: "Woche 33", revision: 4, days: days() });
    }) as typeof fetch;
    return { fetchImpl, calls, fail: (r: (() => Response) | null) => (reply = r) };
  }

  async function linked(days: () => { date: string; people: unknown[] }[]) {
    const fake = fakeWachplan(days);
    const db = openDatabase(":memory:");
    open.push(db);
    const built = await buildApp(config(WACHPLAN), db, { now: () => NOW, fetch: fake.fetchImpl });
    return { ...built, ...fake };
  }

  const setDays = (ledger: { state: { roster: Record<string, unknown> } }) => Object.keys(ledger.state.roster).sort();

  it("holt heute und morgen ab und legt die Besetzung als Aktion des Servers an", async () => {
    const { app, ledger, wachplan, calls } = await linked(() => [
      { date: "2026-08-16", people: today },
      { date: "2026-08-17", people: tomorrow },
      { date: "2026-08-18", people: tomorrow },
    ]);
    const status = await wachplan!.syncNow();
    expect(calls).toEqual([
      {
        url: "https://wachplan.example.test/api/els/duty?from=2026-08-16&to=2026-08-17",
        auth: `Bearer ${"k".repeat(43)}`,
      },
    ]);
    expect(status).toMatchObject({ configured: true, plan: "Woche 33", error: null, warnings: [] });
    expect(status.days).toEqual([
      { date: "2026-08-16", people: 3 },
      { date: "2026-08-17", people: 1 },
    ]);
    expect(setDays(ledger)).toEqual(["2026-08-16", "2026-08-17"]);
    expect(ledger.state.roster["2026-08-16"]).toEqual([
      { id: "u-1", name: "Anna Alpha", role: "WF", station: "hw", boat: null },
      { id: "u-2", name: "Bernd Beta", role: "WG", station: "9-14", boat: null },
      { id: "u-3", name: "Dirk Delta", role: "BF", station: null, boat: "78-1" },
    ]);

    const cookies = cookieOf(await login(app));
    const pull = (await app.inject({ method: "GET", url: "/api/sync/pull", cookies })).json();
    expect(pull.intents.map((i: { intent: { type: string; deviceId: string } }) => i.intent)).toMatchObject([
      { type: "roster.setDay", deviceId: WACHPLAN_DEVICE_ID },
      { type: "roster.setDay", deviceId: WACHPLAN_DEVICE_ID },
    ]);
  });

  it("legt nur bei Änderungen eine neue Aktion an; Umsetzen im ELS bleibt erhalten", async () => {
    let people = today;
    const { ledger, wachplan } = await linked(() => [{ date: "2026-08-16", people }]);
    await wachplan!.syncNow();
    await wachplan!.syncNow();
    const count = () => ledger.pull(0).intents.length;
    expect(count()).toBe(1);

    ledger.apply({
      ...radioIntent(),
      type: "person.move",
      data: { date: "2026-08-16", person: "u-2", station: "9-16" },
    });
    people = [...today, person("u-4", "Erik Epsilon", "tower", "9/12")];
    await wachplan!.syncNow();
    expect(count()).toBe(3);
    expect(ledger.state.roster["2026-08-16"]).toHaveLength(4);
    expect(ledger.state.rosterChanges["2026-08-16"]).toEqual({ "u-2": { station: "9-16" } });
  });

  it("meldet Fehler, ohne etwas zu ändern", async () => {
    const { ledger, wachplan, fail } = await linked(() => [{ date: "2026-08-16", people: today }]);
    fail(() => Response.json({ error: "ELS-Schlüssel fehlt oder ist ungültig" }, { status: 401 }));
    expect((await wachplan!.syncNow()).error).toBe("Der Wachplan nimmt den Schlüssel nicht an.");
    fail(() => Response.json({ error: "Plan konnte nicht gelesen werden" }, { status: 500 }));
    expect((await wachplan!.syncNow()).error).toBe("Wachplan: Plan konnte nicht gelesen werden");
    fail(() => Response.json({ plan: "x", days: "kaputt" }));
    expect((await wachplan!.syncNow()).error).toBe("Antwort des Wachplans nicht lesbar.");
    fail(() => {
      throw new TypeError("fetch failed");
    });
    const status = await wachplan!.syncNow();
    expect(status).toMatchObject({ error: "Wachplan nicht erreichbar.", lastSuccessAt: null });
    expect(ledger.pull(0).intents).toEqual([]);

    fail(null);
    expect(await wachplan!.syncNow()).toMatchObject({ error: null, lastSuccessAt: "2026-08-16T05:30:00.000Z" });
  });

  it("Status nur mit Sitzung; ohne Anbindung meldet der Server sie als aus", async () => {
    const { app } = await linked(() => []);
    expect((await app.inject({ method: "GET", url: "/api/wachplan" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/wachplan/sync", payload: {} })).statusCode).toBe(401);
    const cookies = cookieOf(await login(app));
    const synced = await app.inject({ method: "POST", url: "/api/wachplan/sync", cookies, payload: {} });
    expect(synced.json()).toMatchObject({ configured: true, plan: "Woche 33", error: null });
    expect((await app.inject({ method: "GET", url: "/api/wachplan", cookies })).json().lastSuccessAt).not.toBeNull();

    const plain = await setup();
    const plainCookies = cookieOf(await login(plain.app));
    expect(
      (await plain.app.inject({ method: "GET", url: "/api/wachplan", cookies: plainCookies })).json(),
    ).toMatchObject({ configured: false });
    expect(plain.wachplan).toBeNull();
  });

  it("prüft die Einstellungen beim Start", () => {
    expect(() => config({ WACHPLAN_URL: "https://wachplan.example.test" })).toThrow(/nur zusammen/);
    expect(() => config({ WACHPLAN_KEY: "k".repeat(43) })).toThrow(/nur zusammen/);
    expect(() => config({ WACHPLAN_URL: "", WACHPLAN_KEY: "" })).not.toThrow();
    const production = { NODE_ENV: "production", WACHPLAN_KEY: "k".repeat(43) };
    expect(() => config({ ...production, WACHPLAN_URL: "http://wachplan.example.de" })).toThrow(/HTTPS/);
    expect(() => config({ ...production, WACHPLAN_URL: "http://wachplan:3000" })).not.toThrow();
    expect(() => config({ ...production, WACHPLAN_URL: "http://192.168.1.20:3000" })).not.toThrow();
  });
});
