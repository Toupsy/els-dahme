import { expect, test } from "@playwright/test";

test("Demo startet ohne Login, Aktion bleibt nach Reload erhalten", async ({ page }) => {
  await page.goto("/#/funk");
  await expect(page.getByText("Demo – Daten nur lokal")).toBeVisible();
  await expect(page.getByLabel("Passcode")).toHaveCount(0);
  await page.getByLabel("Von").fill("ad");
  await page.getByLabel("An").fill("alle");
  await page.getByLabel("Nachricht").fill("Demo-Test Funkspruch");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByText("Demo-Test Funkspruch")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Demo-Test Funkspruch")).toBeVisible();
});

test("Funktagebuch: Rufnamen werden erkannt und springen ins nächste Feld", async ({ page }) => {
  await page.goto("/#/funk");
  const from = page.getByLabel("Von");
  const to = page.getByLabel("An");
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");

  await from.click();
  await page.keyboard.type("781");
  await expect(from).toHaveValue("78-1");
  await expect(to).toBeFocused();
  await page.keyboard.type("hw");
  await expect(to).toHaveValue("AD");
  await expect(page.getByLabel("Nachricht")).toBeFocused();
  await page.keyboard.type("Motor läuft, Kontrollfahrt");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("radio-list")).toContainText("Motor läuft, Kontrollfahrt");
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(from).toBeFocused();
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

test("Demo: Lage mit Funktagebuch und Notizen, Turm im Popup", async ({ page }) => {
  await page.goto("/#/lage");
  const panel = page.locator(".lage-panel");
  await panel.getByLabel("Von").fill("ad");
  await panel.getByLabel("An").fill("alle");
  await panel.getByLabel("Nachricht").fill("Lage-Test Funkspruch");
  await panel.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByTestId("lage-radio-log")).toContainText("Lage-Test Funkspruch");

  await page.getByRole("textbox", { name: "Notizen" }).fill("Notiz bleibt");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notizen" })).toHaveValue("Notiz bleibt");

  const before = (await panel.boundingBox())!.height;
  await page.getByRole("separator", { name: "Höhe von Funktagebuch und Notizen" }).press("ArrowUp");
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(before);

  await page.locator(".map-pin.tower", { hasText: "9-15" }).click();
  const popup = page.getByRole("dialog", { name: "Turm 9-15" });
  await expect(popup.getByRole("heading", { name: "Turm 9-15" })).toBeVisible();
  const pin = page.locator(".map-pin.tower", { hasText: "9-15" });
  await expect(pin).toHaveClass(/short/);
  await popup.getByRole("button", { name: "Wieder vollzählig" }).click();
  await expect(pin).not.toHaveClass(/short/);
  await popup.getByRole("button", { name: "−1 Person" }).click();
  await expect(pin).toHaveClass(/short/);
  await expect(pin.locator(".short-badge")).toHaveText("−1");
  await popup.getByRole("button", { name: /^(Aufrödeln|Abrödeln)$/ }).click();
  await expect(page.getByTestId("lage-radio-log")).toContainText("9-15");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});

test("Demo: alle API-Aufrufe enden mit 503", async ({ request }) => {
  expect((await request.get("/api/sync/pull")).status()).toBe(503);
});
