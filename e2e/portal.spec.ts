import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username = "planer", password = "synthetisches-passwort") {
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

test("Konto am Portal → Auswahl → ELS → Wachplan-Vertrag → ELS; Reload und gemeinsame Abmeldung", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await login(page, "planer", "falsch");
  await expect(page.getByRole("alert")).toHaveText("Benutzername oder Passwort falsch.");
  await login(page);
  await expect(page.getByRole("heading", { name: "Werkzeug auswählen" })).toBeVisible();
  await page.screenshot({ path: "test-results/portal-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "ELS öffnen", exact: true }).click();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await expect(page.getByRole("navigation", { name: "Werkzeuge" })).toContainText("ELS");
  await expect(page.getByText("planer", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await page
    .getByRole("navigation", { name: "Werkzeuge" })
    .getByRole("link", { name: "Wachplan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/$/);
  await page.getByRole("link", { name: "ELS öffnen" }).click();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByLabel("Benutzername")).toBeVisible();
  expect((await context.request.get("/api/session")).status()).toBe(401);
  expect((await context.request.get("/plan/api/auth/me")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("Mobiler Login und Auswahl ohne horizontalen Überlauf; Konto ohne Plan abgewiesen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Benutzername")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/portal-mobile-login.png", fullPage: true });
  await login(page, "ohne-plan");
  await expect(page.getByRole("heading", { name: "Werkzeug auswählen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/portal-mobile-chooser.png", fullPage: true });
  await page.getByRole("link", { name: "ELS öffnen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Kein Zugriff");
  await expect(page.getByTestId("sync-badge")).toHaveCount(0);
});

test("Direkteinstieg übernimmt das Konto ohne weitere Anmeldung; fehlende Quelle sperrt APIs", async ({
  page,
  context,
}) => {
  await context.request.post("/plan/api/auth/login", {
    data: { username: "planer", password: "synthetisches-passwort", remember: false },
  });
  await page.goto("/els/#/funk");
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  const els = (await context.cookies()).find((c) => c.name === "els_session")!;
  await context.clearCookies();
  await context.addCookies([els]);
  expect((await context.request.get("/api/sync/pull")).status()).toBe(401);
  await page.reload();
  await expect(page.getByText("Bitte zuerst auf der Startseite anmelden.")).toBeVisible();
});

test("Teilweise fehlgeschlagene Abmeldung wird angezeigt und sperrt das lokale ELS", async ({ page, context }) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("link", { name: "ELS öffnen", exact: true }).click();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await context.request.post("/__fixture/fail-logout");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("konnte nicht bestätigt werden");
  await expect(page.getByTestId("sync-badge")).toHaveCount(0);
  expect((await context.request.get("/api/session")).status()).toBe(401);
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === "wachplan.sid" || c.name === "els_session")).toBe(false);
});

test("Tablet-Passcode erhält nur ELS-Zugang; Offline-Reload und Outbox bleiben erhalten", async ({ page, context }) => {
  await page.goto("/els/?zugang=tablet#/funk");
  await page.getByLabel("Passcode").fill("portal-tablet-test");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  expect((await context.request.get("/plan/api/auth/me")).status()).toBe(401);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");
  await context.setOffline(true);
  await page.getByLabel("Von").fill("AD");
  await page.getByLabel("An", { exact: true }).fill("Alle");
  await page.getByLabel("Nachricht").fill("Portal-Offline-Test");
  await page.getByRole("button", { name: "Eintragen", exact: true }).click();
  await expect(page.getByTestId("sync-badge")).toContainText("1 ausstehend");
  await page.reload();
  await expect(page.getByTestId("radio-list")).toContainText("Portal-Offline-Test");
  await context.setOffline(false);
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced", { timeout: 20000 });
});
