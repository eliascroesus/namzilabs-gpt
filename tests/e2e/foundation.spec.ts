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

test("connection flow stays account-scoped instead of asking for metric configuration", async ({
  page,
}) => {
  await login(page, "/integrations/new/webhook");
  await expect(page.getByRole("heading", { name: "Webhook" })).toBeVisible();
  await expect(page.getByText(/Data objects and filters are selected later/)).toBeVisible();
  await expect(page.getByText(/Choose data/)).toHaveCount(0);
});

test("metric builder exposes the source-first real-data workflow without fixture values", async ({
  page,
}) => {
  await login(page, "/metrics/new");
  await expect(page.getByRole("heading", { name: "Build a metric" })).toBeVisible();
  await expect(page.getByText(/Choose real source data/)).toBeVisible();
  await expect(page.getByText(/canonical activity/i)).toHaveCount(0);
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

test("fixed workspace navigation and theme preference stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "/metrics/new");
  await expect(page.getByRole("heading", { name: "Build a metric" })).toBeVisible();
  const sidebar = page.locator(".app-sidebar");
  const desktopWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  expect(desktopWidth).toBeGreaterThanOrEqual(200);
  expect(desktopWidth).toBeLessThanOrEqual(240);
  const dashboardsLink = page.getByRole("link", { name: "Dashboards" });
  await dashboardsLink.hover();
  await expect
    .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(desktopWidth);
  await expect(dashboardsLink).toContainText("Dashboards");
  await expect(page.locator(".app-theme-dark")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("namzi-app-theme", "light"));
  await page.reload();
  await expect(page.locator(".app-theme-light")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});
