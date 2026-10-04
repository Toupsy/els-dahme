import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSCODE } from "../playwright.config";

async function login(page: Page, passcode = E2E_PASSCODE) {
  await page.getByLabel("Passcode").fill(passcode);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

async function radio(page: Page, text: string) {
  await page.goto("/#/funk");
  await page.getByLabel("Nachricht").fill(text);
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByTestId("radio-list")).toContainText(text);
}

/** Zweites Gerät: frisch anmelden und den Stand des Servers sehen. */
async function secondDevice(context: BrowserContext) {
  const other = await context.browser()!.newContext();
  const page = await other.newPage();
  await page.goto("/#/funk");
  await login(page);
  return { other, page };
}

test("Login: falscher Passcode abgelehnt, richtiger öffnet die App und synchronisiert", async ({ page, context }) => {
  await page.goto("/#/funk");
  await login(page, "falsch");
  await expect(page.getByText("Passcode falsch.")).toBeVisible();
  await login(page);
  await radio(page, "Live-Test Funkspruch");
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");

  const { other, page: second } = await secondDevice(context);
  await expect(second.getByTestId("radio-list")).toContainText("Live-Test Funkspruch");
  await other.close();
});

test("Offline: Netz aus → Aktionen → Netz an → Daten sind synchron", async ({ page, context }) => {
  await page.goto("/#/funk");
  await login(page);
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");

  await context.setOffline(true);
  await page.goto("/#/boote");
  await page.getByTestId("boat-78-3").getByRole("button", { name: "Motor läuft, Probefahrt" }).click();
  await radio(page, "Offline erfasst");
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "offline");
  await expect(page.getByTestId("sync-badge")).toContainText("2 ausstehend");

  await context.setOffline(false);
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced", { timeout: 20_000 });

  const { other, page: second } = await secondDevice(context);
  await expect(second.getByTestId("radio-list")).toContainText("Offline erfasst");
  await expect(second.getByTestId("radio-list")).toContainText("Motor läuft, Probefahrt");
  await second.goto("/#/boote");
  await expect(second.getByTestId("boat-78-3")).toContainText("Motor läuft · Probefahrt");
  await other.close();
});

test("Offline: App startet nach Reload ohne Netz mit lokalen Daten", async ({ page, context }) => {
  await page.goto("/#/funk");
  await login(page);
  await radio(page, "Vor dem Reload");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("radio-list")).toContainText("Vor dem Reload");
  await expect(page.getByLabel("Passcode")).toHaveCount(0);
  await context.setOffline(false);
});

test("Abgelaufene Sitzung: erneuter Login, die Outbox bleibt erhalten", async ({ page, context }) => {
  await page.goto("/#/funk");
  await login(page);
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await context.clearCookies();
  await page.getByLabel("Nachricht").fill("Nach Ablauf erfasst");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByLabel("Passcode")).toBeVisible();
  await login(page);
  await expect(page.getByTestId("radio-list")).toContainText("Nach Ablauf erfasst");
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");

  const { other, page: second } = await secondDevice(context);
  await expect(second.getByTestId("radio-list")).toContainText("Nach Ablauf erfasst");
  await other.close();
});

test("Ohne Sitzung liefert die API 401", async ({ request }) => {
  expect((await request.get("/api/sync/pull")).status()).toBe(401);
  expect((await request.post("/api/sync/push", { data: { intents: [] } })).status()).toBe(401);
});
