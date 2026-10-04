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
