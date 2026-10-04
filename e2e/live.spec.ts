import { expect, test } from "@playwright/test";
import { E2E_PASSCODE } from "../playwright.config";

test("Live: Login mit Passcode, Funkspruch wird synchronisiert", async ({ page, browser }) => {
  await page.goto("/#/funk");
  await page.getByLabel("Passcode").fill("falsch");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Passcode falsch.")).toBeVisible();
  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.getByLabel("Nachricht").fill("Live-Test Funkspruch");
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByTestId("sync-badge")).toHaveAttribute("data-state", "synced");

  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto("/#/funk");
  await second.getByLabel("Passcode").fill(E2E_PASSCODE);
  await second.getByRole("button", { name: "Anmelden" }).click();
  await expect(second.getByText("Live-Test Funkspruch")).toBeVisible();
  await other.close();
});
