import { ArrowRight, Mail } from "lucide-react";
import { Form, required, useLogin, useNotify, useTranslate } from "ra-core";
import { useEffect, useRef, useState } from "react";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";

import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { AuthBrand, AuthLayout } from "./AuthLayout";
import { authErrorKey } from "./authErrors";
import { PasswordInput } from "./PasswordInput";
import { PoweredBy } from "./PoweredBy";
import { SSOAuthButton } from "./SSOAuthButton";
import {
  disableEmailPasswordAuthentication,
  googleWorkplaceDomain,
} from "./authConfig";

/**
 * The sign-in screen.
 *
 * One card, and the order in it is the order of preference: single sign-on
 * first when the installation has it configured, then the divider that says the
 * email form is the alternative, then the form. An installation with
 * `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION` set renders only the first
 * block, and the divider disappears with it — a rule that separates one thing
 * from nothing is furniture.
 *
 * Everything here is a control that does something. The screen does not claim
 * an environment, a session id, a device-trust option or a multi-factor policy:
 * this application has none of those, and a security assurance that is not true
 * is worse than an unadorned form.
 */
export const LoginPage = (props: { redirectTo?: string }) => {
  const { redirectTo } = props;
  const [loading, setLoading] = useState(false);
  const hasDisplayedRecoveryNotification = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldNotify = searchParams.get("passwordRecoveryEmailSent") === "1";

    if (!shouldNotify || hasDisplayedRecoveryNotification.current) {
      return;
    }

    hasDisplayedRecoveryNotification.current = true;
    notify("crm.auth.recovery_email_sent", {
      type: "success",
      messageArgs: {
        _: "If you're a registered user, you should receive a password recovery email shortly.",
      },
    });

    searchParams.delete("passwordRecoveryEmailSent");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, notify]);

  const handleSubmit: SubmitHandler<FieldValues> = (values) => {
    setLoading(true);
    login(values, redirectTo)
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify(authErrorKey(error), { type: "error" });
      });
  };

  const hasPasswordForm = !disableEmailPasswordAuthentication;
  const hasSso = !!googleWorkplaceDomain;

  return (
    <AuthLayout footer={<PoweredBy />}>
      <div className="flex flex-col gap-7">
        <div className="flex flex-col items-center gap-4 text-center">
          <AuthBrand />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {translate("ra.auth.sign_in")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {translate("crm.auth.subtitle")}
            </p>
          </div>
        </div>

        {/* Checked directly rather than through `hasSso`, which is a boolean
            and does not narrow the domain's type for the prop below. */}
        {googleWorkplaceDomain ? (
          <SSOAuthButton
            variant="outline"
            className="h-11 w-full"
            domain={googleWorkplaceDomain}
          >
            {translate("crm.auth.sign_in_google_workspace", {
              _: "Sign in with Google Workplace",
            })}
          </SSOAuthButton>
        ) : null}

        {/* Only when there are two ways in. A divider above a single option
            separates that option from nothing. */}
        {hasSso && hasPasswordForm ? (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {translate("crm.auth.or_email")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ) : null}

        {hasPasswordForm ? (
          <Form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-9.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <TextInput
                label="ra.auth.email"
                source="email"
                type="email"
                autoComplete="email"
                placeholder={translate("crm.auth.email_placeholder")}
                validate={required()}
                inputClassName="pl-9"
                helperText={false}
              />
            </div>

            <PasswordInput
              label="ra.auth.password"
              source="password"
              autoComplete="current-password"
              validate={required()}
              action={
                <Link
                  to="/forgot-password"
                  className="text-sm text-brand hover:underline"
                >
                  {translate("ra-supabase.auth.forgot_password", {
                    _: "Forgot password?",
                  })}
                </Link>
              }
            />

            <Button
              type="submit"
              size="lg"
              className="h-11 w-full"
              disabled={loading}
            >
              {translate("ra.auth.sign_in")}
              {loading ? (
                <Spinner className="size-4" />
              ) : (
                <ArrowRight className="size-4" />
              )}
            </Button>
          </Form>
        ) : null}
      </div>
    </AuthLayout>
  );
};
