"""Health check and system status endpoints.

Does not expose sensitive database credentials, internal hosts, or stack traces.
"""
import logging

from django.conf import settings
from django.db import DatabaseError, connection
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HealthCheckAPIView(APIView):
    """Public health check endpoint (`GET /api/v1/health/`)."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request: Request, *args, **kwargs) -> Response:
        db_status = "connected"
        overall_status = "healthy"
        http_status = status.HTTP_200_OK

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                row = cursor.fetchone()
                if not row or row[0] != 1:
                    raise DatabaseError("Unexpected result from health query.")
        except Exception:
            logger.warning("Database health check failed.")
            db_status = "unavailable"
            overall_status = "degraded"
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE

        local_now = timezone.localtime(timezone.now())

        return Response(
            {
                "status": overall_status,
                "service": "pro-office-api",
                "version": getattr(settings, "APP_VERSION", "1.0.0-phase1"),
                "timezone": settings.TIME_ZONE,
                "checks": {
                    "application": "up",
                    "database": db_status,
                },
                "timestamp": local_now.isoformat(),
            },
            status=http_status,
        )
