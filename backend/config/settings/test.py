"""Test settings for Pro Office."""
from .base import *  # noqa: F401, F403

DEBUG = False

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "auth_login": "200/minute",
}
