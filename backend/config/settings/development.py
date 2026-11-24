"""Development settings for Pro Office."""
from .base import *  # noqa: F401, F403
from .base import env_bool

DEBUG = env_bool("DJANGO_DEBUG", True)

# Allow BrowsableAPIRenderer in development when requested in browser
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]
