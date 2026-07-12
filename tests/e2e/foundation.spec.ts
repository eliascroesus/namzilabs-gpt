import { expect, test } from "@playwright/test";

test("landing page explains the read-only product boundary", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business data, finally in one place." }),
  ).toBeVisible();
  await expect(page.getByText("Read-only integrations by design")).toBeVisible();
});

test("public OAuth pages are available without authentication", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business data, finally in one place." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Legal navigation" }).getByRole("link", {
      name: "Privacy Policy",
    }),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/Google API Services User Data Policy/)).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});

test("integration catalog exposes the six supported sources", async ({ page }) => {
  await page.goto("/integrations");
  for (const name of ["Webhook", "Google Sheets", "Calendly", "Close CRM", "Instantly", "Brevo"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
});

test("wizard refuses to invent production preview records", async ({ page }) => {
  await page.goto("/integrations/new/google-sheets");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preview the latest records" })).toBeVisible();
  await expect(page.getByText("Production never substitutes invented sample data.")).toBeVisible();
});

test("a user can build, preview and publish a deterministic metric", async ({ page }) => {
  await page.goto("/metrics/new");
  for (let index = 0; index < 4; index += 1)
    await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Plain-language definition")).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /publish metric/i }).click();
  await expect(page.getByText(/version 1 published/i)).toBeVisible();
});

test("every overview KPI links to matching records", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/overview");
  const links = page.getByRole("link", { name: /view matching records/i });
  await expect(links).toHaveCount(4);
  await links.first().click();
  await expect(page.getByRole("heading", { name: "Data explorer" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "meeting.booked", exact: true })).toHaveCount(2);
  expect(pageErrors).toEqual([]);
});

test("primary workflows are keyboard reachable", async ({ page }) => {
  await page.goto("/overview");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("link", { name: "Metrics" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
});
