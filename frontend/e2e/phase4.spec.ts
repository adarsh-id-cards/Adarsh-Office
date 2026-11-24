import path from "node:path";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR =
  "C:/Users/roshan/.gemini/antigravity/brain/7273e8e3-1c25-4084-8650-378a806dab61";

test.describe("Pro Office Simplified Workflow Operational Suite", () => {
  test("verifies 4-module workflow: Labour + Machines tab, Stock + Audits tab, and Order-centred Production/Assembly/Dispatch", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const suffix = Date.now().toString().slice(-5);
    const labourerName = `Ramesh Ops ${suffix}`;
    const machineCode = `MCH-16-${suffix}`;
    const clientName = `Phase4 Academy ${suffix}`;

    // 1. Login
    await page.goto("/login");
    await page.getByLabel(/Username or Work Email/i).fill("admin");
    await page.getByLabel(/Password/i).fill("AdarshPhase1Admin#2026");
    await page.getByRole("button", { name: /Sign In to Pro Office/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 2. Labour -> Create Labourer -> Switch to Machines Tab inside Labour
    await page.getByRole("link", { name: /^Labour$/i }).first().click();
    await expect(page).toHaveURL(/\/labour$/);
    await page.getByTestId("open-create-labourer-btn").click();
    await page.locator("#labourer-name").fill(labourerName);
    await page.locator("#labourer-contact").fill("9876543210");
    await page.getByTestId("submit-create-labourer-btn").click();
    await expect(page.getByText(labourerName).first()).toBeVisible({ timeout: 10_000 });

    // 3. Machines tab inside Labour -> Register Physical Machine (16 mm) and Allocate
    await page.getByTestId("labour-tab-machines").click();
    await page.getByTestId("open-add-machine-btn").click();
    await page.locator("#mch-code").fill(machineCode);
    await page.locator("#mch-name").fill(`Press 16mm ${suffix}`);
    await page.locator("#mch-size").selectOption("16 mm");
    await page.getByTestId("submit-create-machine-btn").click();
    await expect(page.getByText(machineCode).first()).toBeVisible();

    await page.getByTestId(`allocate-machine-${machineCode}`).click();
    await page.locator("#alloc-labourer").selectOption({ label: labourerName });
    await page.getByTestId("confirm-allocate-machine-btn").click();
    await expect(page.getByText(`Labourer: ${labourerName}`).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase4_machines_register.png"),
      fullPage: true,
    });

    // 4. Stock -> Record Inventory Stock-In (Packets of 500 Jointers)
    await page.getByRole("link", { name: /^Stock$/i }).first().click();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(page.getByText("Jointer 16 mm").first()).toBeVisible();
    await page.getByTestId("open-stock-in-btn").click();
    await page.locator("#si-mat").selectOption({ label: "Jointer 16 mm" });
    await page.locator("#si-pkg-count").fill("4");
    await page.getByTestId("confirm-stock-in-btn").click();
    await expect(page.getByText("2,000").first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase4_inventory_ledger.png"),
      fullPage: true,
    });

    // 5. Create Lanyard Order (600 pcs) -> Inline Production -> Inline Labour & Assembly
    await page.getByRole("link", { name: /^Orders$/i }).first().click();
    await page.getByTestId("create-order-button").click();
    await page.getByLabel(/Client Name/i).fill(clientName);
    await page.getByTestId("add-lanyard-item-btn").click();
    await page.locator("#item-name-1").fill("Phase4 Lanyards 16mm");
    await page.locator("#item-qty-1").fill("600");
    await page.locator("#lanyard-size-1").selectOption({ label: "16 mm" });
    await page.getByTestId("submit-create-order-btn").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);

    // Inline Production tab inside Order Detail
    await page.getByTestId("open-production-job-2").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\?tab=production/);

    await page.getByTestId("design-approve-btn").click();
    await expect(page.getByTestId("record-printing-run-btn")).toBeEnabled();
    await page.getByTestId("record-printing-run-btn").click();
    await expect(page.getByTestId("open-create-assignment-btn")).toBeEnabled();

    // Switch to inline Labour & Assembly tab inside Order Detail
    await page.getByTestId("order-tab-assembly").click();
    await page.getByTestId("open-create-assignment-btn").click();
    await page.locator("#asm-labourer").selectOption({
      label: `${labourerName} — Compatible (16 mm)`,
    });
    await page.getByTestId("confirm-create-assignment-btn").click();
    await expect(page.getByText(labourerName).first()).toBeVisible();

    // Issue raw materials from assignment
    const issueBtn = page.locator('[data-testid^="issue-materials-btn-"]').first();
    await issueBtn.click();
    await page.getByTestId("confirm-issue-materials-btn").click();
    await expect(page.getByText(/Material Allocations:/i).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase4_assembly_material_issuance.png"),
      fullPage: true,
    });

    // Record assembly receiving & reconcile materials inline
    await page.locator('[data-testid^="receive-assembly-btn-"]').first().click();
    await page.getByTestId("confirm-assembly-receiving-btn").click();
    await page.locator('[data-testid^="reconcile-assignment-btn-"]').first().click();
    await expect(page.getByText(/Materials Reconciled/i).first()).toBeVisible();

    // 6. Inline Packing & Dispatch Tab inside Order Detail + Office Surplus Pool
    await page.getByTestId("order-tab-dispatch").click();
    await page
      .locator("tr", { hasText: "Phase4 Lanyards 16mm" })
      .locator('[data-testid^="open-dispatch-btn-"]')
      .first()
      .click();
    await page.locator("#dsp-office-extra").fill("10");
    await page.getByTestId("confirm-dispatch-btn").click();
    await expect(page.getByText("10 pcs remaining").first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase4_dispatch_surplus.png"),
      fullPage: true,
    });

    // 7. Stock Audits embedded inside Stock module
    await page.getByRole("link", { name: /^Stock$/i }).first().click();
    await page.getByTestId("inventory-tab-audits").click();
    await page.getByTestId("start-new-audit-btn").click();
    await expect(page.getByTestId("submit-audit-btn")).toBeVisible();
    await page.getByTestId("approve-audit-btn").click();
    await expect(page.getByText(/Approved & Reconciled/i).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase4_stock_audit.png"),
      fullPage: true,
    });

    // 8. Sign out cleanly
    await page.getByTestId("user-profile-menu-trigger").click();
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login$/);

    expect(consoleErrors).toEqual([]);
  });
});
