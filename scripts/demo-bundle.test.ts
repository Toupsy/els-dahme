import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error – reines ESM-Skript ohne Typen
import { findForbidden } from "./demo-bundle-check.mjs";

describe("Demo-Build", () => {
  it("enthält keine Server-URL, keinen Passcode und keinen Login-Code", () => {
    execFileSync("node", ["scripts/build-preview.mjs"], { stdio: "pipe" });
    const dir = fileURLToPath(new URL("../apps/web/dist-preview/", import.meta.url));
    expect(findForbidden(dir)).toEqual([]);
  }, 60_000);

  it("die Prüfung schlägt bei verbotenen Inhalten an", () => {
    const dir = mkdtempSync(join(tmpdir(), "els-check-"));
    writeFileSync(join(dir, "a.js"), 'fetch("/api/login",{body:JSON.stringify({passcode})})');
    expect(findForbidden(dir).map((h: { reason: string }) => h.reason)).toEqual([
      "Server-API-Pfad",
      "Passcode/Login-Code",
    ]);
  });
});
