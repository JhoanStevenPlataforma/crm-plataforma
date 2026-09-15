import { Notification } from "@/components/admin/notification";
import { useTranslate } from "ra-core";
import { useConfigurationContext } from "../root/ConfigurationContext";

export const ConfirmationRequired = () => {
  const translate = useTranslate();
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();

  return (
    <div className="h-screen p-8">
      {/* The wordmark carries the product name, so no title text beside it.
          The two variants swap by mode; the old `brightness-0 dark:invert`
          filter forced the mark to pure black or pure white and would strip
          the brand colour out of it. */}
      <div className="flex items-center">
        <img
          className="[.light_&]:hidden h-7 w-auto object-contain"
          src={darkModeLogo}
          alt={title}
        />
        <img
          className="[.dark_&]:hidden h-7 w-auto object-contain"
          src={lightModeLogo}
          alt={title}
        />
      </div>
      <div className="h-full text-center">
        <div className="max-w-sm mx-auto h-full flex flex-col justify-center gap-4">
          <h1 className="text-2xl font-bold mb-4">
            {translate("crm.auth.welcome_title", {
              _: "Welcome to Atomic CRM",
            })}
          </h1>
          <p className="text-base mb-4">
            {translate("crm.auth.confirmation_required", {
              _: "Please follow the link we just sent you by email to confirm your account.",
            })}
          </p>
        </div>
      </div>
      <Notification />
    </div>
  );
};

ConfirmationRequired.path = "/sign-up/confirm";
