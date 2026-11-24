"""ASGI config for Pro Office project."""
import os
from pathlib import Path

from django.core.asgi import get_asgi_application
from dotenv import load_dotenv

root_env = Path(__file__).resolve().parent.parent.parent / ".env"
if root_env.exists():
    load_dotenv(root_env)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_asgi_application()
