// Fügt Szenarien und die Ausgaben von ref.php/ref.cjs zu feature-app-boat-hours.json zusammen.
import { readFileSync, writeFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const scenarios = read("./scenarios.json");
const php = read("./php-out.json");
const js = read("./js-out.json");
const iso = (t) => (t ? `${t.replace(" ", "T")}.000Z` : null);

const out = scenarios.map((s) => ({
  name: s.name,
  date: s.date,
  now: iso(s.now),
  baseMin: s.base_min,
  baseAt: iso(s.base_at),
  entries: s.entries.map(([at, from, text]) => ({ at: iso(at), from, text })),
  expected: Object.fromEntries(
    ["78-1", "78-2", "78-3"].map((b) => [
      b,
      {
        carryMin: php[s.name][b].carry_min,
        dayMin: php[s.name][b].day_min,
        totalMin: php[s.name][b].total_min,
        trips: (js[s.name][b]?.trips ?? []).map((t) => ({
          startedAt: iso(t.startedAt),
          endedAt: iso(t.endedAt),
          minutes: t.minutes,
          legs: t.legs,
        })),
      },
    ]),
  ),
}));
writeFileSync(new URL("./feature-app-boat-hours.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
