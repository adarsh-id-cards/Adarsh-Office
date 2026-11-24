import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, CreditCard, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUiShellStore } from "@/hooks/useToastStore";
import { ApiClientError } from "@/services/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/FormField";
import { envConfig } from "@/lib/env";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username or work email is required."),
  password: z.string().min(1, "Password is required."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage(): React.ReactElement {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const addToast = useUiShellStore((state) => state.addToast);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const fromPath =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from: string }).from
      : "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  if (isAuthenticated) {
    return <Navigate to={fromPath} replace />;
  }

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setAuthError(null);
    try {
      const user = await login(values);
      addToast({
        title: `Welcome, ${user.full_name}`,
        description: `Signed in as ${user.role_label}.`,
        variant: "success",
      });
      navigate(fromPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setAuthError(err.message);
      } else {
        setAuthError("Unable to sign in. Please verify your credentials and try again.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-blue-700 text-white">
            <CreditCard className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-slate-900">
            PRO OFFICE
          </h1>
          <p className="text-[13px] font-medium text-slate-500">{envConfig.companyName}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Internal Staff Sign In</CardTitle>
            <CardDescription>Sign in with your office staff credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {authError ? (
                <div
                  className="flex items-start gap-2 rounded-[8px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{authError}</span>
                </div>
              ) : null}

              <FormField
                id="username"
                label="Username or Work Email"
                required
                error={errors.username?.message}
              >
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. admin"
                  hasError={Boolean(errors.username)}
                  {...register("username")}
                />
              </FormField>

              <FormField
                id="password"
                label="Password"
                required
                error={errors.password?.message}
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  hasError={Boolean(errors.password)}
                  {...register("password")}
                />
              </FormField>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Lock className="h-3.5 w-3.5" />
                {isSubmitting ? "Signing in..." : "Sign In to Pro Office"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          Timezone: Asia/Kolkata (IST) &bull; Session-protected internal portal
        </p>
      </div>
    </div>
  );
}
