"""Consistent API error handling for Django REST Framework."""
import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def _extract_summary_message(data: Any, fallback: str) -> str:
    """Derive a clean human-readable message from DRF error detail structures."""
    if isinstance(data, str):
        return data
    if isinstance(data, list) and data:
        first = data[0]
        return str(first)
    if isinstance(data, dict):
        if "detail" in data:
            return _extract_summary_message(data["detail"], fallback)
        if "non_field_errors" in data:
            return _extract_summary_message(data["non_field_errors"], fallback)
        for field, errors in data.items():
            msg = _extract_summary_message(errors, fallback)
            return f"{field}: {msg}"
    return fallback


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Transform exceptions into a predictable JSON error contract.

    Shape:
    {
        "status": "error",
        "error": {
            "code": "validation_error",
            "message": "Human readable summary",
            "details": { ... }
        }
    }
    """
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict"):
            exc = exceptions.ValidationError(detail=exc.message_dict)
        else:
            exc = exceptions.ValidationError(detail=exc.messages)
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled API exception in %s", context.get("view"))
        return Response(
            {
                "status": "error",
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected error occurred. Please try again.",
                    "details": {},
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    code = getattr(exc, "default_code", "api_error")
    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
    elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        code = "authentication_error"
    elif isinstance(exc, exceptions.PermissionDenied):
        code = "permission_denied"
    elif isinstance(exc, exceptions.NotFound):
        code = "not_found"

    default_msg = getattr(exc, "default_detail", "Request could not be processed.")
    message = _extract_summary_message(response.data, str(default_msg))

    details: Any = response.data
    if isinstance(details, dict) and set(details.keys()) == {"detail"}:
        details = {}

    response.data = {
        "status": "error",
        "error": {
            "code": str(code),
            "message": message,
            "details": details if isinstance(details, (dict, list)) else {},
        },
    }
    return response
