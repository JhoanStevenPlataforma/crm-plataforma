import { useMemo } from "react";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { EmailLanguage } from "../types";
import { emailIconUrl, QUOTE_LINK_MARKER, renderEmail } from "./emailRender";
import type { EmailQuoteSummary } from "./emailRender";
import type { EmailVariables } from "./emailTemplate";

/** Stands where the token will be: the browser never holds it. */
const LINK_PLACEHOLDER = "...";

/**
 * The message as the customer will receive it.
 *
 * The HTML is the dispatcher's own (`emailRender.ts`), shown in a fully
 * sandboxed frame: no script, no navigation, no access to this page. The one
 * thing that differs from the real message is the link -- only the server
 * knows the token, so the preview shows where it will go without holding it.
 */
export const EmailPreview = ({
  subject,
  body,
  language,
  variables,
  toEmail,
  isQuote,
}: {
  subject: string;
  body: string;
  language: EmailLanguage;
  variables: EmailVariables;
  toEmail: string;
  isQuote: boolean;
}) => {
  const translate = useTranslate();
  const { title, lightModeLogo } = useConfigurationContext();

  const html = useMemo(
    () =>
      renderEmail({
        bodyText: body || " ",
        language,
        issuerName: title,
        logoUrl: lightModeLogo,
        iconUrl: emailIconUrl(window.location.origin),
        quoteLink: isQuote
          ? `${window.location.origin}/#/quote#${LINK_PLACEHOLDER}`
          : null,
        quote: isQuote ? (variables as EmailQuoteSummary) : null,
      }).html,
    [body, language, title, lightModeLogo, isQuote, variables],
  );

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">
          {translate("crm.email.fields.to")}
        </dt>
        <dd className="truncate">{toEmail || "—"}</dd>
        <dt className="text-muted-foreground">
          {translate("crm.email.fields.subject")}
        </dt>
        <dd className="font-medium">{subject || "—"}</dd>
      </dl>
      <iframe
        title={translate("crm.email.compose.preview")}
        sandbox=""
        srcDoc={html}
        className="h-[420px] w-full rounded-md border bg-white"
      />
      {isQuote && !body.includes(QUOTE_LINK_MARKER) ? (
        <p className="text-xs text-muted-foreground">
          {translate("crm.email.compose.link_appended")}
        </p>
      ) : null}
    </div>
  );
};
