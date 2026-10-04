import { expect, test } from "@playwright/test";

test("Demo startet ohne Login, Aktion bleibt nach Reload erhalten", async ({ page }) => {
  await page.goto("/#/funk");
  await expect(page.getByText("Demo – Daten nur lokal")).toBeVisible();
  await expect(page.getByLabel("Passcode")).toHaveCount(0);
  await page.getByLabel("Nachricht").fill("Demo-Test Funkspruch");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByText("Demo-Test Funkspruch")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Demo-Test Funkspruch")).toBeVisible();
});

test("Demo: Boot starten, Reload, zurücksetzen", async ({ page }) => {
  await page.goto("/#/boote");
  const boat = page.getByTestId("boat-78-2");
  await boat.getByRole("button", { name: "Motor läuft, Probefahrt" }).click();
  await expect(boat).toContainText("Motor läuft · Probefahrt");
  await page.reload();
  await expect(page.getByTestId("boat-78-2")).toContainText("Motor läuft · Probefahrt");

  await page.goto("/#/einstellungen");
  await page.getByRole("button", { name: "Demo zurücksetzen" }).click();
  await page.getByRole("button", { name: "Ja, zurücksetzen" }).click();
  await page.waitForLoadState("load");
  await page.goto("/#/boote");
  await expect(page.getByTestId("boat-78-2")).toContainText("Motor aus · E-klar HW");
});

test("Demo: alle API-Aufrufe enden mit 503", async ({ request }) => {
  expect((await request.get("/api/sync/pull")).status()).toBe(503);
});
