import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, nextPath: string) {
  await page.context().clearCookies();
  await page.goto(nextPath);
  const passwordField = page.getByLabel("Prototype password");
  if (await passwordField.isVisible()) {
    await passwordField.fill("prototype-test-password");
    await page.getByRole("button", { name: "Open workspace" }).click();
  }
  await expect(page).toHaveURL(new RegExp(nextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

test("landing page explains the read-only product boundary", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business data, finally in one place." }),
  ).toBeVisible();
  await expect(page.getByText("Read-only integrations by design")).toBeVisible();
});

test("public OAuth and trust pages are available without authentication", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/Google API Services User Data Policy/)).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await page.goto("/subprocessors");
  await expect(page.getByRole("heading", { name: "Subprocessors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Neon" })).toBeVisible();
});

test("webhook wizard refuses to invent preview records", async ({ page }) => {
  await login(page, "/integrations/new/webhook");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preview the latest records" })).toBeVisible();
  await expect(page.getByText("Production never substitutes invented sample data.")).toBeVisible();
  await expect(page.getByText("Connect the account to fetch a preview")).toBeVisible();
});

test("metric builder reaches the real-data preview boundary without fixture values", async ({
  page,
}) => {
  await login(page, "/metrics/new");
  await expect(page.getByRole("heading", { name: "Choose a canonical activity" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a calculation" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose optional grouping" })).toBeVisible();
  await expect(page.getByRole("button", { name: /preview real data/i })).toBeVisible();
  await expect(page.getByText(/fixture/i)).toHaveCount(0);
});

test("password wall rejects the wrong password, authenticates, and logs out", async ({ page }) => {
  await page.context().clearCookies();
  const response = await page.request.get("/api/metrics");
  expect(response.status()).toBe(401);
  await page.goto("/metrics/new");
  await page.getByLabel("Prototype password").fill("wrong-password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByText("The password was incorrect.", { exact: true })).toBeVisible();
  await page.getByLabel("Prototype password").fill("prototype-test-password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Build a metric" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/metrics/new");
  await expect(page.getByRole("heading", { name: "Open Namzi Data" })).toBeVisible();
});

test("primary public navigation is keyboard reachable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
