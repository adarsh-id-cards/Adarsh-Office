import path from "node:path";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR =
  "C:/Users/roshan/.gemini/antigravity/brain/7273e8e3-1c25-4084-8650-378a806dab61";

test.describe("Pro Office Phase 3 End-to-End Browser Smoke Suite", () => {
  test("creates multi-item order, executes independent ID card and lanyard production workflows, captures screenshots, and verifies replacement production", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const uniqueSchoolName = `ABC Public School ${Date.now().toString().slice(-5)}`;

    // 1. Visiting protected route redirects to /login
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);

    // 2. Sign in as System Administrator
    await page.getByLabel(/Username or Work Email/i).fill("admin");
    await page.getByLabel(/Password/i).fill("AdarshPhase1Admin#2026");
    await page.getByRole("button", { name: /Sign In to Pro Office/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: /Good (morning|afternoon|evening), System Administrator/i }),
    ).toBeVisible();

    // 3. Create Multi-Item Order (Student ID Cards 1,000 + Staff ID Cards 50 + Lanyards 16mm 1,000)
    await page.getByRole("link", { name: /^Orders$/i }).first().click();
    await page.getByTestId("create-order-button").click();
    await page.getByLabel(/Client Name/i).fill(uniqueSchoolName);

    // Item 1: Student ID Cards — 1,000
    await page.locator("#item-name-0").fill("Student ID Cards");
    await page.locator("#item-qty-0").fill("1000");

    // Item 2: Staff ID Cards — 50
    await page.getByTestId("add-card-item-btn").click();
    await page.locator("#item-name-1").fill("Staff ID Cards");
    await page.locator("#item-qty-1").fill("50");

    // Item 3: Lanyards — 1,000 (16 mm)
    await page.getByTestId("add-lanyard-item-btn").click();
    await page.locator("#item-name-2").fill("School Lanyards 16mm");
    await page.locator("#item-qty-2").fill("1000");
    await page.locator("#lanyard-size-2").selectOption({ label: "16 mm" });

    await page.getByTestId("submit-create-order-btn").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    await expect(page.getByText("2,050").first()).toBeVisible();

    // 4. Open Lanyard Production inline tab inside Order Detail (Line 3)
    await page.getByTestId("open-production-job-3").click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\?tab=production/);
    await expect(page.getByTestId("lanyard-batch-calculator-panel")).toBeVisible();

    // Verify Lanyard Batch Calculator displays ceil(1000/30) = 34 batches, 1,020 pcs, 20 surplus
    const calcPanel = page.getByTestId("lanyard-batch-calculator-panel");
    await expect(calcPanel).toContainText("30 pcs / batch");
    await expect(calcPanel).toContainText("34 batches");
    await expect(calcPanel).toContainText("1,020 pcs");
    await expect(calcPanel).toContainText("20 pcs");

    // Advance Lanyard through Stage 1 (Design) -> Stage 2 (Printing) -> Stage 3 (Assembly) -> Stage 4 (Dispatch)
    await page.getByTestId("design-start-btn").click();
    await expect(page.getByText("Design Started").first()).toBeVisible();
    await page.getByTestId("design-complete-btn").click();
    await expect(page.getByTestId("record-printing-run-btn")).toBeEnabled();

    // Record Lanyard Printing Run (34 batches = 1,020 gross, 5 rejected waste = 1,015 good)
    await page.locator("#run-rejected-qty").fill("5");
    await page.getByTestId("record-printing-run-btn").click();
    await expect(page.getByText("1,015").first()).toBeVisible();

    // Capture screenshot of Lanyard Production inline workspace
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase3_lanyard_production_detail.png"),
      fullPage: true,
    });

    // Complete Lanyard Assembly (1,000 units)
    await page.getByTestId("assembly-complete-btn").click();

    // 5. Switch to Order Overview tab and open Student ID Card Production (Line 1)
    await page.getByTestId("order-tab-overview").click();
    await expect(page.getByText(/Partially Completed \(1\/3 Items Ready\)/i)).toBeVisible();

    await page.getByTestId("open-production-job-1").click();
    await page.getByTestId("design-start-btn").click();
    await expect(page.getByText("Design Started").first()).toBeVisible();
    await page.getByTestId("design-complete-btn").click();
    await expect(page.getByTestId("record-printing-run-btn")).toBeEnabled();

    // Batch 1: 400 cards
    await page.locator("#run-actual-qty").fill("400");
    await page.getByTestId("record-printing-run-btn").click();
    await expect(page.getByText("Partially Printed").first()).toBeVisible();

    // Batch 2: 600 cards (reaching 1,000 required)
    await page.locator("#run-actual-qty").fill("600");
    await page.getByTestId("record-printing-run-btn").click();
    await expect(page.getByTestId("complete-id-card-production-btn")).toBeEnabled();
    await page.getByTestId("complete-id-card-production-btn").click();
    await expect(page.getByText(/Ready for Packing \/ Dispatch/i).first()).toBeVisible();

    // Capture screenshot of ID Card Production Detail with multiple printing runs
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase3_id_card_production_detail.png"),
      fullPage: true,
    });

    // 6. Verify backward-compatible Production Queue permalink still resolves
    await page.goto("/production");
    await expect(page).toHaveURL(/\/production$/);
    await expect(
      page.getByRole("heading", { name: "Production Management" }),
    ).toBeVisible();
    await expect(page.getByText("Student ID Cards").first()).toBeVisible();
    await expect(page.getByText("Staff ID Cards").first()).toBeVisible();
    await expect(page.getByText("School Lanyards 16mm").first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "phase3_production_dashboard.png"),
      fullPage: true,
    });

    // 7. Sign out cleanly
    await page.getByTestId("user-profile-menu-trigger").click();
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login$/);

    expect(consoleErrors).toEqual([]);
  });
});
