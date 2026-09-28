import { useState } from "react";
import { useResetPassword } from "ra-supabase-core";
import { Form, required, useNotify, useRedirect, useTranslate } from "ra-core";
import { Layout } from "@/components/supabase/layout";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { authErrorKey } from "@/components/atomic-crm/login/authErrors";

interface FormData {
  email: string;
}

export const ForgotPasswordPage = () => {
  const [loading, setLoading] = useState(false);

  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [, { mutateAsync: resetPassword }] = useResetPassword({
    onSuccess: () => {
      redirect("/login?passwordRecoveryEmailSent=1");
    },
    onError: () => undefined,
  });

  const submit = async (values: FormData) => {
    try {
      setLoading(true);
      await resetPassword({
        email: values.email,
      });
    } catch (error: unknown) {
      notify(authErrorKey(error, "crm.auth.errors.reset_failed"), {
        type: "warning",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {translate("ra-supabase.reset_password.forgot_password", {
            _: "Forgot password?",
          })}
        </h1>
        <p>
          {translate("ra-supabase.reset_password.forgot_password_details", {
            _: "Enter your email to receive a reset password link.",
          })}
        </p>
      </div>
      <Form<FormData>
        className="space-y-8"
        onSubmit={submit as SubmitHandler<FieldValues>}
      >
        <TextInput
          source="email"
          label={translate("ra.auth.email", {
            _: "Email",
          })}
          autoComplete="email"
          validate={required()}
        />
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {translate("crm.action.reset_password", {
            _: "Reset password",
          })}
        </Button>
      </Form>
      {/* Without it this page was a dead end: the only way back to sign-in
          was the browser's back button. */}
      <Link
        to="/login"
        className="text-center text-sm text-brand hover:underline"
      >
        {translate("crm.auth.back_to_sign_in")}
      </Link>
    </Layout>
  );
};

ForgotPasswordPage.path = "forgot-password";
