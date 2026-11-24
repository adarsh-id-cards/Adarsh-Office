# Pro Office — Order Workspace Simplification & Type-Based Workflow Redesign

**Project:** Pro Office — Adarsh ID Cards  
**Module:** Orders & Production Workspace  
**Status:** Complete & Verified  
**Date:** 2026-11-24  

---

## 1. Executive Summary

The Order Details workspace in Pro Office has been comprehensively redesigned from a fragmented, tab-heavy admin view into an intuitive, workflow-centered operational dashboard. Office operators can now open an order and immediately understand:
1. **Order summary & identity:** Order number, client name, order date, and overall order status.
2. **Item-by-item progress cards:** Independent, item-type-specific visual step progression.
3. **Obvious Next Action:** A single, prominent primary action per item, eliminating guesswork and decision fatigue.
4. **Seamless production integration:** Inline expandable production panels (`open-production-job-${line}`) for batch calculators and printing runs without disrupting context.

All existing business logic, independent original/replacement metrics, stock tracking, and test IDs have been strictly preserved.

---

## 2. What Was Removed, Simplified, or Redesigned

| Before (Cluttered Admin View) | Redesigned (Workflow-First Workspace) | Rationale |
|---|---|---|
| **Multiple competing tabs** (Overview, Production, History, Replacements, Status Log, Specs) | **Single unified workflow default view** with an optional secondary tab for "History & Replacements" | Operators no longer navigate between multiple tabs just to understand order progress. |
| **Generic workflow steps** (Same stages shown for all item categories) | **Strict item-type-specific workflows:**<br>• ID Cards: 3 stages (`Design` → `Printing` → `Ready for Dispatch`)<br>• Lanyards: 4 stages (`Design` → `Printing` → `Assembly` → `Dispatch`) | Eliminates confusion: ID cards never show an assembly step, and lanyards cleanly guide operators through assembly. |
| **Competing action buttons** (Start Design, Record Run, Mark Complete, Update Dispatch displayed simultaneously) | **Single contextual "Next Action" per item card** with secondary details tucked neatly inside an expandable panel | Guides the user through the logical next step with zero cognitive overload. |
| **Cluttered order header** (Multiple rows of metadata, edit forms, duplicate labels) | **Clean, compact header** with status badge, promised date, single primary action ("Confirm Order" if draft), and a clean "More Actions" dropdown | Maintains focus on production work while keeping metadata and actions accessible. |
| **Fragmented quantity tables** | **Compact 4-column metrics strip:**<br>1. Ordered Qty<br>2. Produced / Ready<br>3. Dispatched Qty<br>4. Remaining to Ship | Real-time tracking of units ready in office vs shipped vs pending. |

---

## 3. Visual Step Design by Item Type

### A. ID Card Workflow (Exactly 3 Stages)
```
[ 1. Design ] ───► [ 2. Printing ] ───► [ 3. Ready for Dispatch ]
```
- **Stage 1: Design**
  - *Pending:* "Design not started"
  - *In Progress:* "Design in progress" (Active pulse)
  - *Completed:* "Design approved"
- **Stage 2: Printing**
  - *Blocked:* "Blocked until design is approved"
  - *In Progress:* "Production printing run" (Displays printed count vs ordered)
  - *Completed:* "Printed successfully"
- **Stage 3: Ready for Packing & Dispatch**
  - *Pending:* "Waiting for printing completion"
  - *Ready:* "Ready for packing and client dispatch"
  - *Completed:* "Fully dispatched"

> **Key Rule:** ID Cards do not require assembly and never display an assembly stage.

---

### B. Lanyard Workflow (Exactly 4 Stages)
```
[ 1. Design ] ───► [ 2. Printing ] ───► [ 3. Assembly ] ───► [ 4. Dispatch ]
```
- **Stage 1: Design**
  - *Pending:* "Design not started"
  - *In Progress:* "Design in progress"
  - *Completed:* "Design approved"
- **Stage 2: Printing**
  - *Blocked:* "Blocked until design is approved"
  - *In Progress:* "Printing run" (Gross batches calculated)
  - *Completed:* "Printing complete"
- **Stage 3: Assembly**
  - *Blocked:* "Blocked until printing is complete"
  - *In Progress:* "Labour attachment / hook fitting"
  - *Completed:* "Assembly complete"
- **Stage 4: Dispatch**
  - *Pending:* "Awaiting assembly completion"
  - *Ready:* "Ready for client dispatch"
  - *Completed:* "Fully dispatched"

---

## 4. Obvious Next Action Resolution

Each order item evaluates its current state and resolves a **single primary action**:

| Item State | Condition | Primary Action Button | Target / Behavior |
|---|---|---|---|
| **Draft Order** | Order is in `draft` status | *(Order Level)* **Confirm Order** | Confirms order and generates production jobs |
| **Design Pending** | Design status = `pending` | **Start Design** | Opens production panel and focuses Design workflow |
| **Design In Progress**| Design status = `in_progress`| **Complete / Approve Design**| Opens production panel to approve design |
| **Printing Ready** | Design approved, printing < target | **Record Printing Run** | Opens inline printing runner & batch tool |
| **Assembly Ready** (Lanyard) | Printing complete, assembly < target | **Complete Assembly** | Opens assembly assignment / completion |
| **Ready for Dispatch** | Production complete, dispatched < ordered | **Update Dispatched Qty** | Opens Quick Dispatch modal to record quantity sent |
| **Completed** | Dispatched >= ordered | **Order Fulfilled** *(Disabled)* | Item completely fulfilled |
| **Cancelled Order** | Order status = `cancelled` | *(None / Blocked notice)* | Operations prevented |

---

## 5. Verification Matrix (Tests A through F)

| Test ID | Scenario | Expected Outcome | Result |
|---|---|---|---|
| **Test A** | Single ID card order | Shows exactly 3 stages. Advances Design → Printing → Ready for Dispatch with no assembly step. | **PASS** |
| **Test B** | Single lanyard order | Shows exactly 4 stages. Advances Design → Printing → Assembly → Dispatch. | **PASS** |
| **Test C** | Mixed order (ID Cards + Lanyards) | Line 1 and 2 show 3-stage workflows; Line 3 shows 4-stage workflow. Progress runs independently without cross-item blocking. | **PASS** |
| **Test D** | Replacement order | Displays linked original order banner. Original and replacement quantities tracked independently. | **PASS** |
| **Test E** | Cancelled order | Shows cancellation banner and reason. Disables state transitions and destructive operations. | **PASS** |
| **Test F** | Responsive mobile viewports | Horizontal workflow bars scale cleanly with touch scroll; primary actions stack cleanly on mobile (375px & 768px). | **PASS** |

---

## 6. Test Suite Execution Results

### Unit Test Suite (Vitest)
```
✓ src/test/Phase3Production.test.tsx (2 tests)
✓ src/test/App.test.tsx (5 tests)
✓ src/test/Phase2Orders.test.tsx (3 tests)

Test Files  3 passed (3)
Tests       10 passed (10)
Duration    4.05s
```

### End-to-End Test Suite (Playwright)
```
Running 2 tests using 1 worker
  ok 1 [chromium] › e2e\phase5_responsive_and_fixes.spec.ts:4:3 › Pro Office Client & Order Core Workspace Verification (20.4s)
  ok 2 [chromium] › e2e\smoke.spec.ts:8:3 › Pro Office Phase 3 End-to-End Browser Smoke Suite (12.3s)

2 passed (33.8s)
```

### Static Analysis & Production Build
- `npx tsc -b`: **0 errors**
- `vite build`: **Built successfully (dist: 630 kB JS, 32.5 kB CSS)**
- Console Errors: **0 errors**

---

## 7. Backward Compatibility

1. **Test IDs Retained:** All existing Playwright test IDs (`open-production-job-*`, `order-tab-overview`, `lanyard-batch-calculator-panel`, `design-start-btn`, `design-complete-btn`, `record-printing-run-btn`, `assembly-complete-btn`, `complete-id-card-production-btn`, etc.) remain fully functional.
2. **URL Parameter Sync:** Clicking production details syncs `?tab=production&item=<item_id>` to support deep links and browser history navigation.
3. **Backend Schema:** Zero alterations to backend models, database migrations, or API contracts.
