# Pro Office — Adarsh ID Cards

**Pro Office** is the internal production and operations management web application for **Adarsh ID Cards**.

This repository branch (`main`) contains the focused **Client, Multi-Item Order, and Production Management** implementation covering authentication & permissions, client directory & profiles, multi-item ID card & lanyard orders, replacement orders, and independent ID card & lanyard printing workflows.

> [!NOTE]
> Central Inventory, Stock Movements, Stock Audits, Labourer Profiles, Machines, and Dispatch modules are isolated on the **`feature/stock-inventory`** branch for upcoming integration.

The frontend navigation is organized around **2 core operational modules** (`Clients`, `Orders`), an action-oriented `Dashboard`, and a secondary `Administration` section (`Users & Roles`, `Activity Logs`, `Settings & Health`).

---

## 1. Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript (Strict Mode), Vite 6, Tailwind CSS 3, shadcn/ui patterns, React Router 7, TanStack Query 5, React Hook Form + Zod, Lucide React, Zustand (UI shell state only) |
| **Backend** | Python 3.11+, Django 5.1, Django REST Framework 3.15, `django-cors-headers`, `psycopg` v3, Gunicorn + WhiteNoise |
| **Database** | PostgreSQL 17 (UUIDv4 primary keys for all business and system entities, `Asia/Kolkata` timezone) |
| **Infrastructure** | Docker, Docker Compose, Nginx 1.27 Reverse Proxy, environment-driven configuration |
| **Testing** | Pytest + `pytest-django`, Vitest + React Testing Library, Playwright E2E smoke tests |

---

## 2. Repository Structure

```text
pro-office/
├── backend/
│   ├── config/                 # Django settings (base, development, production, test), URLs, WSGI/ASGI
│   ├── apps/
│   │   ├── common/             # TimeStampedUUIDModel, ArchivableModel, exception handler, pagination, health API
│   │   ├── accounts/           # Custom UUID User model, RolePermission, session auth endpoints, create_initial_admin
│   │   ├── audit_logs/         # Immutable AuditLog model, recording service, and admin-scoped audit API
│   │   ├── catalog/            # Product & lanyard specification catalog (12 mm = 37, 16 mm = 30, 20 mm = 25)
│   │   ├── clients/            # Duplicate-safe client directory and aggregated order metrics
│   │   ├── orders/             # Multi-item original & replacement orders, atomic numbering (ORD-1001+)
│   │   ├── production/         # Independent ID card & lanyard production jobs, batch calc, printing runs
│   │   ├── labour/             # Office-managed Labourer profiles (zero user accounts) & SeasonalClosing recovery
│   │   ├── machines/           # Physical press machines, compatibility matching & single-active-holder locks
│   │   ├── inventory/          # Immutable StockMovement ledger, vendor packaging, balances, consumption & defects
│   │   ├── assembly/           # Split lanyard assembly assignments, balance-aware issuance, receiving & reconcile
│   │   ├── stock_audit/        # Weekly physical stock audit workflow (Draft -> Submit -> Approve adjustments)
│   │   └── dispatch/           # Packing & partial/full dispatch, ClientSurplusRecord & OfficeSurplusPool
│   ├── requirements/           # base.txt, development.txt, production.txt
│   ├── manage.py
│   ├── pytest.ini
│   ├── entrypoint.sh
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/                # Router, ProtectedRoute, navigationConfig, AppProviders, AuthProvider, layouts
│   │   ├── components/         # UI primitives (ui/), shared components (shared/), form dialogs (forms/)
│   │   ├── modules/            # auth, dashboard, clients, orders, production, labour, machines, inventory, stock_audit, dispatch, system
│   │   ├── services/           # Centralized apiClient (CSRF + credentials), authService, phase2/3/4/system services
│   │   ├── hooks/              # useAuth, useUiShellStore
│   │   ├── lib/                # envConfig, IST formatting utilities
│   │   ├── types/              # Strict TypeScript interfaces for API, Auth, Orders, Production, Phase 4 Ops
│   │   └── test/               # Vitest + React Testing Library setup and test suites
│   ├── e2e/                    # Playwright E2E regression & responsive verification specs
│   └── Dockerfile
├── infrastructure/
│   ├── nginx/nginx.conf        # Unified reverse proxy configuration
│   └── docker/                 # Production environment template
├── docs/
│   ├── architecture/           # HLD.md and LLD.md
│   ├── api/                    # API_V1.md
│   ├── database/               # SCHEMA.md
│   ├── development/            # CONVENTIONS.md
│   ├── FRONTEND_UX_REDESIGN_REPORT.md
│   ├── FINAL_VERIFICATION_REPORT.md
│   └── PHASE_STATUS.md
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Port Isolation from Existing Adarsh Services

To prevent port or container collisions with any existing Adarsh ID Cards applications running on the same host, all external ports are configurable via `.env` and default to isolated bindings:

- **Nginx Reverse Proxy (Unified HTTP Entry):** `PRO_OFFICE_HTTP_PORT=8088`
- **Django Backend API:** `PRO_OFFICE_BACKEND_PORT=8008`
- **Frontend Dev / Container Port:** `PRO_OFFICE_FRONTEND_PORT=5178`
- **PostgreSQL Database Port:** `PRO_OFFICE_DB_PORT=5434`

---

## 4. Local Development Setup (Without Docker)

### Prerequisites
- Python 3.11+
- Node.js 22+ (or 24+) and npm
- PostgreSQL 15+ (configured on port `5434` or customized in `.env`)

### Step 1: Environment Configuration
```bash
cp .env.example .env
```

### Step 2: Backend Setup & Database Migrations
```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
# source .venv/bin/activate

pip install -r backend/requirements/development.txt

cd backend
python manage.py migrate
python manage.py seed_phase4_defaults
python manage.py check
```

### Step 3: Create Initial Owner / Admin User
Never hardcode credentials in code. Create the initial administrator using the custom management command:
```bash
cd backend
python manage.py create_initial_admin \
  --username admin \
  --email admin@adarshidcards.local \
  --full-name "System Administrator" \
  --password "YourStrongPassword#2026"
```
*(Alternatively, set `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_FULL_NAME`, and `INITIAL_ADMIN_PASSWORD` in `.env` and run `python manage.py create_initial_admin --if-none-exists`.)*

### Step 4: Run Backend Development Server
```bash
cd backend
python manage.py runserver 0.0.0.0:8008
```

### Step 5: Frontend Setup & Development Server
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5178` in your browser. Vite proxies `/api/*` requests to `http://localhost:8008`.

---

## 5. Docker Compose Deployment

### Start All Services
```bash
cp infrastructure/docker/production.env.example .env
# Edit .env and set DJANGO_SECRET_KEY, POSTGRES_PASSWORD, and INITIAL_ADMIN_PASSWORD
docker compose up -d --build
```

Once running:
- **Unified Web Application (via Nginx):** `http://localhost:8088`
- **Health Check Endpoint:** `http://localhost:8088/api/v1/health/`

### Useful Docker Compose Commands
```bash
# View service status and healthchecks
docker compose ps

# Follow backend logs
docker compose logs -f backend

# Run database migrations manually inside container
docker compose exec backend python manage.py migrate

# Bootstrap initial Owner/Admin account inside container
docker compose exec backend python manage.py create_initial_admin \
  --username adarsh.admin \
  --email owner@adarshidcards.com \
  --full-name "Adarsh Owner" \
  --password "ProvideStrongPasswordHere"
```

---

## 6. Database Backup and Restore Instructions

### Backup PostgreSQL Database
**Docker Compose environment:**
```bash
docker compose exec -T db pg_dump -U pro_office_user -d pro_office_db -F c > pro_office_backup_$(date +%Y%m%d_%H%M%S).dump
```

**Host PostgreSQL environment (port 5434):**
```bash
pg_dump -h localhost -p 5434 -U pro_office_user -d pro_office_db -F c -f pro_office_backup.dump
```

### Restore PostgreSQL Database
**Docker Compose environment:**
```bash
cat pro_office_backup.dump | docker compose exec -T db pg_restore -U pro_office_user -d pro_office_db --clean --if-exists
```

**Host PostgreSQL environment (port 5434):**
```bash
pg_restore -h localhost -p 5434 -U pro_office_user -d pro_office_db --clean --if-exists pro_office_backup.dump
```

---

## 7. Running Automated Tests

### Backend Tests (Pytest + Django System Check)
```bash
cd backend
python manage.py check
pytest -v
```

### Frontend Unit & Integration Tests (TypeScript + Vitest + Build)
```bash
cd frontend
npm run lint
npm run test
npm run build
```

### Browser Smoke Tests (Playwright)
With the backend running on port `8008` and frontend running on port `5178`:
```bash
cd frontend
npx playwright test
```
