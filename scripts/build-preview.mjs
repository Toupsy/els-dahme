// Baut die öffentliche Vorschau (VITE_DEMO=true) nach apps/web/dist-preview
// und bricht ab, wenn der Build Server-URLs, Passcode- oder Login-Code enthält.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findForbidden } from "./demo-bundle-check.mjs";

const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const result = spawnSync("pnpm", ["exec", "vite", "build"], {
  cwd: web,
  stdio: "inherit",
  env: { ...process.env, VITE_DEMO: "true" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const hits = findForbidden(fileURLToPath(new URL("../apps/web/dist-preview/", import.meta.url)));
if (hits.length) {
  for (const hit of hits) console.error(`Demo-Build enthält ${hit.reason}: „${hit.match}“ in ${hit.file}`);
  process.exit(1);
}
console.log("Demo-Build geprüft: keine Server-URL, kein Passcode, kein Login-Code.");
