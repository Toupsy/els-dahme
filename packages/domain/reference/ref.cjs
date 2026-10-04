// Rechnet die Szenarien mit computeBoatTrips/ftSpanMs/ftTripMinutes aus
// els/scripts/funktagebuch.js der Feature-App (unverändert geladen).
const fs = require("fs");
const vm = require("vm");
const scenarios = JSON.parse(fs.readFileSync(__dirname + "/scenarios.json", "utf8"));
const src = fs.readFileSync("/home/user/dahme-feature-yannis/els/scripts/funktagebuch.js", "utf8");
const out = {};
for (const s of scenarios) {
  const nowMs = Date.parse(s.now.replace(" ", "T") + "Z");
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(nowMs);
      else super(...a);
    }
    static now() {
      return nowMs;
    }
  }
  const ctx = {
    document: {
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    window: {},
    Date: FakeDate,
    console,
    Intl,
    Math,
    Number,
    String,
    Object,
    Set,
    Map,
    Array,
    isNaN,
    URLSearchParams,
  };
  vm.createContext(ctx);
  vm.runInContext(
    src + "\n;this.__api={computeBoatTrips,ftSpanMs,ftTripMinutes,ftDayBounds,ftDayCapMs,ftTodayKey};",
    ctx,
  );
  const api = ctx.__api;
  const { from, to } = api.ftDayBounds(s.date);
  // Client lädt nur die Einträge des Tages (Server filtert from/to in UTC).
  const iso = (t) => t.replace(" ", "T") + "Z";
  const entries = s.entries
    .filter((e) => iso(e[0]) >= from && iso(e[0]) <= to)
    .map((e, i) => ({ id: i, timestamp: e[0], sender_name: e[1], message_text: e[2] }));
  const trips = api.computeBoatTrips(entries, ["78-1", "78-2", "78-3"]);
  const cap = api.ftDayCapMs(s.date);
  const res = {};
  for (const t of trips) {
    const acc = (res[t.callSign] ||= { trips: [], clientDayMin: 0, sumMs: 0 });
    const ms = api.ftSpanMs(t, cap);
    acc.sumMs += ms;
    acc.trips.push({
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      minutes: api.ftTripMinutes(ms),
      legs: t.legs.map((l) => l.reason),
    });
  }
  for (const v of Object.values(res)) {
    v.clientDayMin = api.ftTripMinutes(v.sumMs);
    delete v.sumMs;
  }
  out[s.name] = res;
}
console.log(JSON.stringify(out, null, 1));
