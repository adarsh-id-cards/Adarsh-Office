from django.urls import path

from .views import (
    ChangePasswordAPIView,
    CSRFTokenAPIView,
    CurrentUserAPIView,
    LoginAPIView,
    LogoutAPIView,
    UserListAPIView,
)

urlpatterns = [
    path("csrf/", CSRFTokenAPIView.as_view(), name="auth-csrf"),
    path("login/", LoginAPIView.as_view(), name="auth-login"),
    path("logout/", LogoutAPIView.as_view(), name="auth-logout"),
    path("me/", CurrentUserAPIView.as_view(), name="auth-me"),
    path("password/change/", ChangePasswordAPIView.as_view(), name="auth-password-change"),
    path("users/", UserListAPIView.as_view(), name="auth-user-list"),
]
