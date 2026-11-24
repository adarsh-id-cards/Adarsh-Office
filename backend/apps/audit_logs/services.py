"""Service layer for recording audit log events consistently."""
from typing import Any

from django.http import HttpRequest

from .models import AuditLog


def get_client_ip(request: HttpRequest | None) -> str | None:
    """Extract client IP address from request headers safely."""
    if request is None:
        return None
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def get_user_agent(request: HttpRequest | None) -> str:
    """Extract and truncate client user-agent header."""
    if request is None:
        return ""
    return (request.META.get("HTTP_USER_AGENT") or "")[:255]


def record_audit_log(
    *,
    action: str,
    module: str,
    summary: str,
    actor: Any = None,
    actor_username: str = "",
    target_type: str = "",
    target_id: str = "",
    metadata: dict[str, Any] | None = None,
    request: HttpRequest | None = None,
) -> AuditLog:
    """Persist an AuditLog entry with actor snapshot and request metadata."""
    resolved_actor = actor if (actor is not None and getattr(actor, "is_authenticated", False)) else None
    resolved_username = actor_username
    resolved_role = ""

    if resolved_actor is not None:
        resolved_username = resolved_username or getattr(resolved_actor, "username", "")
        resolved_role = getattr(resolved_actor, "role", "")

    return AuditLog.objects.create(
        actor=resolved_actor,
        actor_username=resolved_username,
        actor_role=resolved_role,
        action=action,
        module=module,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        summary=summary,
        metadata=metadata or {},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
