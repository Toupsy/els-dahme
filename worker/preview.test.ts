import { describe, expect, it } from "vitest";
import worker from "./preview";

const env = { ASSETS: { fetch: async () => new Response("<html></html>", { status: 200 }) } };

describe("Vorschau-Worker", () => {
  it("beantwortet alle API-Aufrufe mit 503", async () => {
    for (const path of ["/api/login", "/api/sync/pull", "/health"]) {
      const response = await worker.fetch(new Request(`https://demo.example${path}`), env);
      expect(response.status).toBe(503);
    }
  });

  it("liefert statische Dateien mit Sicherheits-Headern", async () => {
    const response = await worker.fetch(new Request("https://demo.example/"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
