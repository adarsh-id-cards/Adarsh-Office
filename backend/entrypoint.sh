#!/bin/sh
set -e

echo "Waiting for PostgreSQL at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
python - <<'PY'
import os
import sys
import time
import psycopg

host = os.getenv("POSTGRES_HOST", "db")
port = int(os.getenv("POSTGRES_PORT", "5432"))
user = os.getenv("POSTGRES_USER", "pro_office_user")
password = os.getenv("POSTGRES_PASSWORD", "")
dbname = os.getenv("POSTGRES_DB", "pro_office_db")

for attempt in range(30):
    try:
        conn = psycopg.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
            connect_timeout=3,
        )
        conn.close()
        print("PostgreSQL connection established.")
        sys.exit(0)
    except Exception as exc:
        print(f"PostgreSQL unavailable (attempt {attempt + 1}/30): {exc}")
        time.sleep(2)

print("Timed out waiting for PostgreSQL.")
sys.exit(1)
PY

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Seeding Phase 4 default materials and vendor packaging..."
python manage.py seed_phase4_defaults

echo "Collecting static files..."
python manage.py collectstatic --noinput

if [ -n "${INITIAL_ADMIN_PASSWORD:-}" ]; then
    echo "Ensuring initial Owner/Admin account exists..."
    python manage.py create_initial_admin --if-none-exists
fi

exec "$@"
