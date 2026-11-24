"""Tests for the `/api/v1/health/` endpoint and standard error handler."""
from unittest.mock import patch

import pytest
from django.db import DatabaseError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestHealthCheckAPI:
    def test_health_check_returns_healthy_when_database_connected(self) -> None:
        client = APIClient()
        url = reverse("v1:health-check")
        response = client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "pro-office-api"
        assert data["timezone"] == "Asia/Kolkata"
        assert data["checks"]["application"] == "up"
        assert data["checks"]["database"] == "connected"
        assert "timestamp" in data
        # Ensure sensitive database details are never exposed
        assert "password" not in str(data).lower()
        assert "host" not in data
        assert "port" not in data

    def test_health_check_returns_503_when_database_unavailable(self) -> None:
        client = APIClient()
        url = reverse("v1:health-check")

        with patch("apps.common.views.connection.cursor", side_effect=DatabaseError("db down")):
            response = client.get(url)

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        data = response.json()
        assert data["status"] == "degraded"
        assert data["checks"]["application"] == "up"
        assert data["checks"]["database"] == "unavailable"
        assert "db down" not in str(data)
