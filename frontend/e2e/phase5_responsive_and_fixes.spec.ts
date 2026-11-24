import { expect, test } from "@playwright/test";

test.describe("Pro Office Client & Order Core Workspace Verification", () => {
  test("verifies core 2-module navigation, quick actions, global search, and responsive viewports", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // 1. Authenticate at Desktop viewport (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await page.getByLabel(/Username or Work Email/i).fill("admin");
    await page.getByLabel(/Password/i).fill("AdarshPhase1Admin#2026");
    await page.getByRole("button", { name: /Sign In to Pro Office/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 2. Verify Redesigned Dashboard & Primary Sidebar (ONLY Clients and Orders)
    const primaryNav = page.getByLabel("Primary Sidebar Navigation");
    await expect(primaryNav.getByRole("link", { name: /^Dashboard$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Clients$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Orders$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Labour$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Stock$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Production$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Machines$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Dispatch$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Stock Audit$/i })).toHaveCount(0);

    await expect(page.getByTestId("qa-new-order")).toBeVisible();
    await expect(page.getByTestId("qa-add-client")).toBeVisible();
    await expect(page.getByTestId("qa-new-replacement")).toBeVisible();
    await expect(page.getByTestId("qa-production")).toBeVisible();

    // 3. Verify Quick Actions open targeted workflows cleanly
    await page.getByTestId("qa-add-client").click();
    await expect(page).toHaveURL(/\/clients/);
    await page.goto("/dashboard");

    // 4. Verify Desktop, Tablet (768x1024), and Mobile (390x844) layouts across core routes
    const routes = [
      "/dashboard",
      "/clients",
      "/orders",
      "/production",
      "/system/settings",
      "/system/users",
      "/system/activity-logs",
    ];
    const viewports = [
      { name: "desktop", width: 1280, height: 800 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth + 4;
        });
        expect(hasOverflow, `Unexpected horizontal overflow on ${route} at ${vp.name}`).toBe(false);
      }
    }

    // 5. Create Order & Verify in Client Directory
    await page.setViewportSize({ width: 1280, height: 800 });
    const suffix = Date.now().toString().slice(-5);
    const clientName = `Adarsh Client ${suffix}`;

    await page.goto("/orders");
    await page.getByTestId("create-order-button").click();
    await page.getByLabel(/Client Name/i).fill(clientName);
    await page.locator("#item-name-0").fill("Custom Student Cards");
    await page.locator("#item-qty-0").fill("150");
    await page.getByTestId("submit-create-order-btn").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    await expect(page.getByText("150").first()).toBeVisible();

    // Verify Global Search locates the client cleanly
    await page.getByTestId("global-search-input").fill(clientName);
    await expect(page.getByText(clientName).first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
