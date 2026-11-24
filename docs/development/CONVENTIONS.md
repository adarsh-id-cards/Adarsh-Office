# Development & Engineering Conventions — Pro Office

## 1. Naming Conventions

### Python / Django Backend
- **Modules & Packages:** `snake_case` (e.g., `audit_logs`, `create_initial_admin.py`).
- **Classes (Models, Views, Serializers):** `PascalCase` (e.g., `TimeStampedUUIDModel`, `HealthCheckAPIView`).
- **Functions, Methods & Variables:** `snake_case` (e.g., `record_audit_log`, `get_effective_permissions`).
- **Constants & Settings:** `UPPER_SNAKE_CASE` (e.g., `ROLE_DEFAULT_PERMISSIONS`, `SESSION_COOKIE_NAME`).
- **Database Tables:** Explicitly named in `Meta.db_table` with the `pro_office_` prefix (`pro_office_users`, `pro_office_role_permissions`, `pro_office_audit_logs`).

### TypeScript / React Frontend
- **Components & Pages:** `PascalCase` filenames and exports (`DashboardPage.tsx`, `ProtectedRoute.tsx`).
- **Hooks & Services:** `camelCase` filenames and exports (`useAuth.ts`, `apiClient.ts`, `authService.ts`).
- **Types & Interfaces:** `PascalCase` (`AuthUser`, `HealthCheckResponse`, `NavigationItem`).
- **Environment Variables:** Accessed exclusively through `src/lib/env.ts` (`VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_APP_COMPANY`). Never hardcode backend URLs inside components.

---

## 2. Coding Standards

1. **TypeScript Strict Mode:**
   - `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, and `noUncheckedIndexedAccess: true` are enforced in `tsconfig.json`.
   - `npm run lint` (`tsc --noEmit`) must pass with zero warnings or errors before any commit.
2. **State Management Separation:**
   - **Server State:** All API data (current user profile, health status, user lists, audit logs, and future operational records) must reside in **TanStack Query**.
   - **Local UI State:** Ephemeral UI state (mobile sidebar drawer, toast queue) uses minimal **Zustand** (`useUiShellStore`) or component `useState`.
   - **Forbidden Storage:** Never store authentication credentials, session tokens, or critical business data in `localStorage` or `sessionStorage`.
3. **Forms & Validation:**
   - Use **React Hook Form** paired with **Zod** schemas (`@hookform/resolvers/zod`) and the shared `FormField` wrapper.

---

## 3. REST API Conventions (`/api/v1/`)

### Base Path & Versioning
All API endpoints live under `/api/v1/` and return `application/json`.

### Standard Error Envelope
All 4xx and 5xx responses are formatted by `apps.common.exceptions.custom_exception_handler`:
```json
{
  "status": "error",
  "error": {
    "code": "validation_error",
    "message": "username: This field is required.",
    "details": {
      "username": ["This field is required."]
    }
  }
}
```

### Standard Pagination Envelope
List endpoints use `apps.common.pagination.StandardResultsSetPagination` (`page_size = 25`, configurable up to `100` via `?page_size=`):
```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "page_size": 25,
  "results": []
}
```

---

## 4. Testing Standards

Every phase must include automated verification at three levels:
1. **Backend Integration & Unit Tests (`pytest`):**
   - Located in `backend/apps/<module>/tests/test_*.py`.
   - Must test model constraints, permission boundaries (`403 Forbidden` for unauthorized roles), API response contracts, and audit log side effects.
2. **Frontend Component & Routing Tests (`vitest` + React Testing Library):**
   - Located in `frontend/src/test/*.test.tsx`.
   - Must verify protected route redirection, login flow, dashboard rendering, and placeholder states.
3. **End-to-End Browser Smoke Tests (`playwright`):**
   - Located in `frontend/e2e/smoke.spec.ts`.
   - Exercises real browser navigation, login/logout against the live Django + PostgreSQL backend, responsive drawer behavior, and verifies zero `console.error` events.
