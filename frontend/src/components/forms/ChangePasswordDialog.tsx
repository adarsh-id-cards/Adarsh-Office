import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/FormField";
import { authService } from "@/services/authService";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required."),
    new_password: z.string().min(8, "New password must be at least 8 characters."),
    confirm_password: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "New password and confirmation do not match.",
    path: ["confirm_password"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps): React.ReactElement {
  const addToast = useUiShellStore((state) => state.addToast);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  React.useEffect(() => {
    if (!open) {
      reset();
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: ChangePasswordFormValues): Promise<void> => {
    setServerError(null);
    try {
      await authService.changePassword(values);
      addToast({
        title: "Password Updated",
        description: "Your account password has been changed.",
        variant: "success",
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError("Unable to update password. Please try again.");
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change Account Password"
      description="Update your Pro Office password. Your active session will remain signed in."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            {serverError}
          </div>
        ) : null}

        <FormField
          id="current_password"
          label="Current Password"
          required
          error={errors.current_password?.message}
        >
          <Input
            id="current_password"
            type="password"
            autoComplete="current-password"
            hasError={Boolean(errors.current_password)}
            {...register("current_password")}
          />
        </FormField>

        <FormField
          id="new_password"
          label="New Password"
          required
          hint="Minimum 8 characters; avoid common or purely numeric passwords."
          error={errors.new_password?.message}
        >
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.new_password)}
            {...register("new_password")}
          />
        </FormField>

        <FormField
          id="confirm_password"
          label="Confirm New Password"
          required
          error={errors.confirm_password?.message}
        >
          <Input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            hasError={Boolean(errors.confirm_password)}
            {...register("confirm_password")}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
