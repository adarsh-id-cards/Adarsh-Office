import { expect, test } from "@playwright/test";

test.describe("Pro Office Workflow Redesign & Responsive Verification", () => {
  test("verifies 4-module navigation, quick actions, global search, responsive viewports, and Scenario E dispatch cap inside Order workspace", async ({
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

    // 2. Verify Redesigned Dashboard & Primary Sidebar (ONLY 4 operational modules)
    const primaryNav = page.getByLabel("Primary Sidebar Navigation");
    await expect(primaryNav.getByRole("link", { name: /^Dashboard$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Clients$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Orders$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Labour$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Stock$/i })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: /^Production$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Machines$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Dispatch$/i })).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: /^Stock Audit$/i })).toHaveCount(0);

    await expect(page.getByTestId("qa-new-order")).toBeVisible();
    await expect(page.getByTestId("qa-add-client")).toBeVisible();
    await expect(page.getByTestId("qa-assign-labour")).toBeVisible();
    await expect(page.getByTestId("qa-stock-in")).toBeVisible();

    // Verify /api/v1/inventory/reconcile/ returns full consistency
    const reconcileRes = await page.request.get("/api/v1/inventory/reconcile/");
    expect(reconcileRes.status()).toBe(200);
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.all_reconciled).toBe(true);

    // 3. Verify Quick Actions open targeted workflows cleanly
    await page.getByTestId("qa-add-client").click();
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByLabel(/Client Name/i).first()).toBeVisible();
    await page.keyboard.press("Escape");

    // 4. Verify Desktop, Tablet (768x1024), and Mobile (390x844) layouts across primary & admin routes
    const routes = [
      "/dashboard",
      "/clients",
      "/orders",
      "/labour",
      "/stock",
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

    // 5. Inline Order Workflow & Scenario E Dispatch Cap Check
    await page.setViewportSize({ width: 1280, height: 800 });
    const suffix = Date.now().toString().slice(-5);
    const labName = `Phase5 Lab ${suffix}`;
    const clientName = `ScenarioE School ${suffix}`;

    await page.goto("/labour");
    await page.getByTestId("open-create-labourer-btn").click();
    await page.locator("#labourer-name").fill(labName);
    await page.getByTestId("submit-create-labourer-btn").click();
    await expect(page.getByText(labName).first()).toBeVisible();

    await page.goto("/orders");
    await page.getByTestId("create-order-button").click();
    await page.getByLabel(/Client Name/i).fill(clientName);
    await page.getByTestId("add-lanyard-item-btn").click();
    await page.locator("#item-name-1").fill("ScenarioE Lanyards");
    await page.locator("#item-qty-1").fill("100");
    await page.locator("#lanyard-size-1").selectOption({ label: "16 mm" });
    await page.getByTestId("submit-create-order-btn").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);

    // Inline Production -> Design -> Print -> Inline Labour & Assembly -> Receive 80 usable
    await page.getByTestId("open-production-job-2").click();
    await page.getByTestId("design-approve-btn").click();
    await expect(page.getByTestId("record-printing-run-btn")).toBeEnabled();
    await page.getByTestId("record-printing-run-btn").click();
    await expect(page.getByTestId("open-create-assignment-btn")).toBeEnabled();

    await page.getByTestId("order-tab-assembly").click();
    await page.getByTestId("open-create-assignment-btn").click();
    await page.locator("#asm-labourer").selectOption({ label: `${labName} — No 16 mm Machine` });
    await page.getByText(/Override machine compatibility check/i).click();
    await page.locator("#asm-override-reason").fill("Phase 5 Scenario E UI check");
    await page.getByTestId("confirm-create-assignment-btn").click();

    await page.locator('[data-testid^="receive-assembly-btn-"]').first().click();
    await page.locator("#recv-usable").fill("80");
    await page.locator("#recv-defective").fill("10");
    await page.getByTestId("confirm-assembly-receiving-btn").click();
    await expect(page.getByText(/80/).first()).toBeVisible();

    // Verify Global Search locates the client/order cleanly
    await page.getByTestId("global-search-input").fill(clientName);
    await expect(page.getByText(clientName).first()).toBeVisible();

    // Open inline Packing & Dispatch tab directly inside Order Detail
    await page.getByTestId("order-tab-dispatch").click();
    const openBtn = page
      .locator("tr", { hasText: "ScenarioE Lanyards" })
      .locator('[data-testid^="open-dispatch-btn-"]')
      .first();
    await openBtn.click();
    await expect(page.locator("#dsp-order-qty")).toHaveValue("80");

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Trigger intentional negative validation check (HTTP 400 expected)
    await page.locator("#dsp-order-qty").fill("90");
    await page.getByTestId("confirm-dispatch-btn").click();
    await expect(page.getByText(/Cannot dispatch 90/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
