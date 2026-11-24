"""Authentication, session management, and user profile API views."""
from django.contrib.auth import login, logout, update_session_auth_hash
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit_logs.services import get_client_ip, record_audit_log

from .models import User
from .permissions import IsOwnerAdmin
from .serializers import ChangePasswordSerializer, LoginSerializer, UserSerializer


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFTokenAPIView(APIView):
    """Issue a CSRF cookie and token for browser session requests (`GET /api/v1/auth/csrf/`)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request: Request, *args, **kwargs) -> Response:
        csrf_token = get_token(request)
        is_authenticated = bool(
            request.user and request.user.is_authenticated and request.user.is_active
        )
        return Response(
            {
                "csrfToken": csrf_token,
                "isAuthenticated": is_authenticated,
            },
            status=status.HTTP_200_OK,
        )


class LoginAPIView(APIView):
    """Authenticate an internal user and establish an HTTP-only session cookie (`POST /api/v1/auth/login/`)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request: Request, *args, **kwargs) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            attempted_username = str(request.data.get("username", ""))[:150]
            record_audit_log(
                action="AUTH_LOGIN_FAILED",
                module="accounts",
                summary=f"Failed sign-in attempt for '{attempted_username or 'unknown'}'",
                actor_username=attempted_username,
                request=request,
            )
            serializer.is_valid(raise_exception=True)

        user: User = serializer.validated_data["user"]
        login(request, user)

        user.last_login = timezone.now()
        user.last_login_ip = get_client_ip(request)
        user.save(update_fields=["last_login", "last_login_ip"])

        record_audit_log(
            action="AUTH_LOGIN",
            module="accounts",
            summary=f"User '{user.username}' signed in.",
            actor=user,
            target_type="User",
            target_id=str(user.id),
            request=request,
        )

        csrf_token = get_token(request)
        return Response(
            {
                "user": UserSerializer(user).data,
                "csrfToken": csrf_token,
            },
            status=status.HTTP_200_OK,
        )


class LogoutAPIView(APIView):
    """Terminate the active user session (`POST /api/v1/auth/logout/`)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args, **kwargs) -> Response:
        user = request.user
        record_audit_log(
            action="AUTH_LOGOUT",
            module="accounts",
            summary=f"User '{user.username}' signed out.",
            actor=user,
            target_type="User",
            target_id=str(user.id),
            request=request,
        )
        logout(request)
        return Response(
            {"detail": "Successfully signed out."},
            status=status.HTTP_200_OK,
        )


class CurrentUserAPIView(APIView):
    """Return the currently authenticated user's profile and capabilities (`GET /api/v1/auth/me/`)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, *args, **kwargs) -> Response:
        return Response(
            {"user": UserSerializer(request.user).data},
            status=status.HTTP_200_OK,
        )


class ChangePasswordAPIView(APIView):
    """Change the password for the authenticated user (`POST /api/v1/auth/password/change/`)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args, **kwargs) -> Response:
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        user: User = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        update_session_auth_hash(request, user)

        record_audit_log(
            action="AUTH_PASSWORD_CHANGED",
            module="accounts",
            summary=f"User '{user.username}' changed their password.",
            actor=user,
            target_type="User",
            target_id=str(user.id),
            request=request,
        )

        return Response(
            {"detail": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


class UserListAPIView(generics.ListAPIView):
    """Read-only directory of internal user accounts for Owner / Admin (`GET /api/v1/auth/users/`)."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerAdmin]
    queryset = User.objects.all().order_by("full_name", "username")
