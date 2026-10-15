/**
 * Demo-mode stand-in for outbound email (docs/proposals/outbound-email.md).
 *
 * A browser tab has no mail provider, so NOTHING is ever sent here: every
 * message is recorded as `simulated`, the status the real backend gives the
 * development provider, and the screens say so.
 *
 * What is mirrored is what the server DECIDES and a demo would otherwise
 * misrepresent: which version of a quotation may be shared, who may type a
 * free address, the same press of "Send" being one message, and a variable
 * nobody filled not reaching the customer. Not mirrored: RLS (FakeRest has no
 * row filter) and the frequency limits (there is nobody to protect). It must
 * keep agreeing with `email_queue.test.sql` / `email_quote.test.sql`.
 */

import type { DataProvider, Identifier } from "ra-core";

import type {
  Company,
  Contact,
  Deal,
  EmailContext,
  EmailEntityType,
  EmailMessage,
  EmailQuoteBlock,
  EmailRecipient,
  EmailServiceStatus,
  Lead,
  Quote,
  QuoteStatus,
  QuoteVersion,
  Sale,
} from "../../types";
import { EMAIL_ERROR, EmailRpcError } from "../commons/emailRpc";
import type { EmailErrorKey } from "../commons/emailRpc";
import type { EmailMethods } from "../supabase/emailMethods";

/** A tab cannot reach Vault: said, not faked. */
export const EMAIL_DEMO_UNAVAILABLE = "crm.email.demo_unavailable";

const ALL = { page: 1, perPage: 1000 };
const BY_ID = { field: "id", order: "ASC" } as const;
/** The same rule as `public.is_valid_email()`. */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const COMMON_VARIABLES = [
  "issuer_name",
  "sender_name",
  "sender_email",
  "customer_name",
  "customer_company",
];
const QUOTE_VARIABLES = [
  "quote_number",
  "quote_title",
  "quote_version",
  "issue_date",
  "valid_until",
  "total",
  "currency",
  "quote_link",
];

function refuse(
  key: EmailErrorKey,
  message: string,
  block: EmailQuoteBlock | null = null,
): never {
  throw new EmailRpcError(message, key, block);
}

const sameId = (
  a: Identifier | null | undefined,
  b: Identifier | null | undefined,
) => a != null && b != null && String(a) === String(b);

const listAll = async <T>(
  dataProvider: DataProvider,
  resource: string,
): Promise<T[]> => {
  const { data } = await dataProvider.getList<any>(resource, {
    filter: {},
    sort: BY_ID,
    pagination: ALL,
  });
  return (data ?? []) as T[];
};

const findOne = async <T extends { id: Identifier }>(
  dataProvider: DataProvider,
  resource: string,
  id: Identifier | null | undefined,
): Promise<T | undefined> =>
  id == null
    ? undefined
    : (await listAll<T>(dataProvider, resource)).find((row) =>
        sameId(row.id, id),
      );

const fullName = (person: {
  first_name?: string | null;
  last_name?: string | null;
}) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
  null;

const variablesIn = (text: string): string[] =>
  [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1]);

const today = () => new Date().toISOString().slice(0, 10);

/** A timestamp's calendar day where the sender is, as `YYYY-MM-DD`. */
const localDay = (value: string | null | undefined): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const issuedVersionsOf = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
) =>
  (await listAll<QuoteVersion>(dataProvider, "quote_versions"))
    .filter(
      (version) =>
        sameId(version.quote_id, quoteId) && version.issued_at != null,
    )
    .sort((a, b) => b.version_number - a.version_number);

/** `email_quote_share_block()`, in the same order. */
const quoteShareBlock = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
  versionId: Identifier | null | undefined,
): Promise<EmailQuoteBlock | null> => {
  const quote = await findOne<Quote>(dataProvider, "quotes", quoteId);
  if (!quote) return "quote_not_found";

  const versions = (
    await listAll<QuoteVersion>(dataProvider, "quote_versions")
  ).filter((version) => sameId(version.quote_id, quoteId));
  const version = versions.find((candidate) => sameId(candidate.id, versionId));
  if (!version || version.issued_at == null) return "quote_not_issued";

  const newerIssued = versions.some(
    (candidate) =>
      candidate.issued_at != null &&
      candidate.version_number > version.version_number,
  );
  if (version.superseded_at != null || newerIssued) return "version_superseded";
  if (version.accepted_at != null || version.rejected_at != null) {
    return "version_answered";
  }

  const statuses = await listAll<QuoteStatus>(dataProvider, "quote_statuses");
  if (
    statuses.some(
      (status) => status.key === quote.status_key && status.is_terminal,
    )
  ) {
    return "quote_closed";
  }
  if (versions.some((candidate) => candidate.issued_at == null)) {
    return "quote_revision_open";
  }
  if (
    version.valid_until != null &&
    version.valid_until.slice(0, 10) < today()
  ) {
    return "version_expired";
  }
  return null;
};

const contactAddresses = (contacts: Contact[]): EmailRecipient[] =>
  contacts.flatMap((contact) =>
    (contact.email_jsonb ?? []).map((entry) => ({
      email: String(entry.email ?? "").toLowerCase(),
      name: fullName(contact),
      contact_id: contact.id,
    })),
  );

/** The addresses the CRM does not write to (`email_is_suppressed()`). */
const suppressedAddresses = async (dataProvider: DataProvider) =>
  new Set(
    (await listAll<{ email: string }>(dataProvider, "email_suppressions")).map(
      (suppression) => String(suppression.email).toLowerCase(),
    ),
  );

/** `email_entity_recipients()`: the addresses a record lets its reader write to. */
const recipientsOf = async (
  dataProvider: DataProvider,
  entityType: EmailEntityType,
  entityId: Identifier,
): Promise<EmailRecipient[]> => {
  const contacts = await listAll<Contact>(dataProvider, "contacts");
  let found: EmailRecipient[] = [];

  if (entityType === "contact") {
    found = contactAddresses(contacts.filter((c) => sameId(c.id, entityId)));
  } else if (entityType === "company") {
    found = contactAddresses(
      contacts.filter((c) => sameId(c.company_id, entityId)),
    );
  } else if (entityType === "deal") {
    const deal = await findOne<Deal>(dataProvider, "deals", entityId);
    const ids = (deal?.contact_ids ?? []).map(String);
    found = contactAddresses(
      contacts.filter((c) => ids.includes(String(c.id))),
    );
  } else if (entityType === "lead") {
    const lead = await findOne<Lead>(dataProvider, "leads", entityId);
    found = lead?.email
      ? [
          {
            email: String(lead.email).toLowerCase(),
            name: fullName(lead),
            contact_id: null,
          },
        ]
      : [];
  } else {
    const quote = await findOne<Quote>(dataProvider, "quotes", entityId);
    found = contactAddresses(
      contacts.filter(
        (c) =>
          sameId(c.id, quote?.contact_id) ||
          sameId(c.company_id, quote?.company_id),
      ),
    );
  }

  const suppressed = await suppressedAddresses(dataProvider);
  const unique = new Map<string, EmailRecipient>();
  for (const recipient of found) {
    if (EMAIL_PATTERN.test(recipient.email) && !unique.has(recipient.email)) {
      unique.set(recipient.email, {
        ...recipient,
        is_suppressed: suppressed.has(recipient.email),
      });
    }
  }
  return [...unique.values()].sort((a, b) => a.email.localeCompare(b.email));
};

/** `email_entity_variables()`. */
const variablesOf = async (
  dataProvider: DataProvider,
  entityType: EmailEntityType | null,
  entityId: Identifier | null,
  sender: Sale | undefined,
  versionId?: Identifier | null,
): Promise<Record<string, string | number | null>> => {
  const configuration = (
    await listAll<{ id: number; config: { title?: string } }>(
      dataProvider,
      "configuration",
    )
  )[0];
  const variables: Record<string, string | number | null> = {
    issuer_name: configuration?.config?.title ?? "",
    sender_name: sender ? (fullName(sender) ?? "") : "",
    sender_email: sender?.email ?? "",
  };
  if (entityType == null || entityId == null) return variables;

  const companyName = async (id: Identifier | null | undefined) =>
    (await findOne<Company>(dataProvider, "companies", id))?.name ?? "";

  if (entityType === "contact") {
    const contact = await findOne<Contact>(dataProvider, "contacts", entityId);
    variables.customer_name = contact ? (fullName(contact) ?? "") : "";
    variables.customer_company = await companyName(contact?.company_id);
  } else if (entityType === "lead") {
    const lead = await findOne<Lead>(dataProvider, "leads", entityId);
    variables.customer_name = lead ? (fullName(lead) ?? "") : "";
    variables.customer_company = lead?.company_name ?? "";
  } else if (entityType === "company") {
    const name = await companyName(entityId);
    variables.customer_name = name;
    variables.customer_company = name;
  } else if (entityType === "deal") {
    const deal = await findOne<Deal>(dataProvider, "deals", entityId);
    const name = await companyName(deal?.company_id);
    variables.deal_name = deal?.name ?? "";
    variables.customer_name = name;
    variables.customer_company = name;
  } else {
    const quote = await findOne<Quote>(dataProvider, "quotes", entityId);
    const issued = await issuedVersionsOf(dataProvider, entityId);
    const version =
      issued.find((candidate) => sameId(candidate.id, versionId)) ?? issued[0];
    if (quote && version) {
      const snapshot = (version.party_snapshot ?? {}) as {
        contact?: { first_name?: string; last_name?: string } | null;
        company?: { name?: string } | null;
      };
      const contact = snapshot.contact;
      const company = snapshot.company?.name ?? "";
      Object.assign(variables, {
        customer_name: (contact ? fullName(contact) : null) ?? company,
        customer_company: company,
        quote_number: quote.quote_number,
        quote_title: quote.title ?? "",
        quote_version: version.version_number,
        issue_date: localDay(version.issued_at),
        valid_until: (version.valid_until ?? "").slice(0, 10),
        total: version.total,
        currency: version.currency,
      });
    }
  }
  return variables;
};

const DEMO_STATUS: Omit<EmailServiceStatus, "can_send_any"> = {
  is_enabled: true,
  provider_key: "mock",
  is_simulated: true,
  is_ready: true,
  from_email: null,
  from_name: null,
  has_credentials: false,
  has_webhook_secret: false,
};

export const createDemoEmailMethods = (
  getDataProvider: () => DataProvider,
  getSalesId: () => Promise<Identifier | null>,
): EmailMethods => {
  const senderOf = async () =>
    findOne<Sale>(getDataProvider(), "sales", await getSalesId());

  const managesAll = (sender: Sale | undefined) =>
    sender?.role === "admin" || sender?.role === "manager";

  const statusFor = (sender: Sale | undefined): EmailServiceStatus => ({
    ...DEMO_STATUS,
    can_send_any: managesAll(sender),
  });

  return {
    getEmailStatus: async () => statusFor(await senderOf()),

    getEmailContext: async (entityType, entityId) => {
      const dataProvider = getDataProvider();
      const sender = await senderOf();
      let quote: EmailContext["quote"] = null;

      if (entityType === "quote") {
        const [newest] = await issuedVersionsOf(dataProvider, entityId);
        quote = {
          version_id: newest?.id ?? null,
          version_number: newest?.version_number ?? null,
          block: newest
            ? await quoteShareBlock(dataProvider, entityId, newest.id)
            : "quote_not_issued",
        };
      }

      return {
        status: statusFor(sender),
        recipients: await recipientsOf(dataProvider, entityType, entityId),
        variables: await variablesOf(
          dataProvider,
          entityType,
          entityId,
          sender,
          quote?.version_id,
        ),
        allowed_variables: [
          ...COMMON_VARIABLES,
          ...(entityType === "deal" ? ["deal_name"] : []),
          ...(entityType === "quote" ? QUOTE_VARIABLES : []),
        ],
        quote,
      };
    },

    sendEmail: async (input) => {
      const dataProvider = getDataProvider();
      const sender = await senderOf();
      if (!sender) refuse(EMAIL_ERROR.forbidden, "No active user");

      const messages = await listAll<
        EmailMessage & { idempotency_key?: string }
      >(dataProvider, "email_messages");
      const replay = messages.find(
        (message) => message.idempotency_key === input.idempotencyKey,
      );
      if (replay) return replay;

      const toEmail = input.toEmail.trim().toLowerCase();
      const subject = input.subject.trim();
      const body = input.body.trim();
      const isQuote = input.entityType === "quote";

      if (!EMAIL_PATTERN.test(toEmail)) {
        refuse(EMAIL_ERROR.recipientInvalid, "Invalid recipient address");
      }
      if ((await suppressedAddresses(dataProvider)).has(toEmail)) {
        refuse(
          EMAIL_ERROR.recipientSuppressed,
          "This address is on the suppression list",
        );
      }
      if (
        !subject ||
        subject.length > 200 ||
        CONTROL_CHARACTERS.test(subject)
      ) {
        refuse(EMAIL_ERROR.subjectInvalid, "Invalid subject");
      }
      if (!body) refuse(EMAIL_ERROR.bodyInvalid, "Invalid body");

      const stray =
        variablesIn(subject)[0] ??
        variablesIn(body).find((name) => name !== "quote_link" || !isQuote);
      if (stray) {
        refuse(
          EMAIL_ERROR.unresolvedVariable,
          `The message still contains {{${stray}}}`,
        );
      }

      if (input.entityType == null || input.entityId == null) {
        if (sender.role !== "admin") {
          refuse(EMAIL_ERROR.forbidden, "Only an admin sends a test message");
        }
      } else if (isQuote) {
        const block = await quoteShareBlock(
          dataProvider,
          input.entityId,
          input.quoteVersionId,
        );
        if (block) {
          refuse(
            EMAIL_ERROR.quoteNotShareable,
            `The quotation cannot be shared: ${block}`,
            block,
          );
        }
      }

      const known =
        input.entityType != null && input.entityId != null
          ? (
              await recipientsOf(dataProvider, input.entityType, input.entityId)
            ).find((recipient) => recipient.email === toEmail)
          : undefined;
      if (!known && !managesAll(sender)) {
        refuse(
          EMAIL_ERROR.recipientNotAllowed,
          "This address is not related to the record",
        );
      }

      const now = Date.now();
      const isDuplicate = messages.some(
        (message) =>
          message.to_email === toEmail &&
          now - new Date(message.created_at).getTime() < DUPLICATE_WINDOW_MS &&
          !["canceled", "failed"].includes(message.status) &&
          message.entity_type === input.entityType &&
          sameId(message.entity_id, input.entityId) &&
          (isQuote
            ? sameId(message.quote_version_id, input.quoteVersionId)
            : message.subject === subject),
      );
      if (isDuplicate && !input.confirmDuplicate) {
        refuse(
          EMAIL_ERROR.duplicateRecent,
          "The same message was sent to this address a moment ago",
        );
      }

      const { data } = await dataProvider.create<EmailMessage>(
        "email_messages",
        {
          data: {
            created_at: new Date(now).toISOString(),
            sales_id: sender.id,
            origin: input.entityType == null ? "test" : "manual",
            category: "transactional",
            language: input.language ?? "es",
            to_email: toEmail,
            to_name: input.toName?.trim() || known?.name || null,
            contact_id: known?.contact_id ?? null,
            subject,
            body_text: body,
            template_id: input.templateId ?? null,
            template_key: null,
            variables: await variablesOf(
              dataProvider,
              input.entityType,
              input.entityId,
              sender,
              input.quoteVersionId,
            ),
            entity_type: input.entityType,
            entity_id: input.entityId,
            quote_id: isQuote ? input.entityId : null,
            quote_version_id: isQuote ? (input.quoteVersionId ?? null) : null,
            // Nothing left this tab, and the record says exactly that.
            status: "simulated",
            attempt: 1,
            provider_key: "mock",
            provider_message_id: null,
            error_code: null,
            error: null,
            accepted_at: null,
            delivered_at: null,
            bounced_at: null,
            failed_at: null,
            idempotency_key: input.idempotencyKey,
          },
        },
      );
      return data;
    },

    getEmailTemplateVariables: async (scope) => [
      ...COMMON_VARIABLES,
      ...(scope === "deal" ? ["deal_name"] : []),
      ...(scope === "quote" ? QUOTE_VARIABLES : []),
    ],

    // Nothing fails in a tab that sends nothing.
    retryEmail: async () =>
      refuse(EMAIL_ERROR.notRetryable, "Only a failed message can be retried"),

    setEmailProviderSecret: async () => {
      throw new Error(EMAIL_DEMO_UNAVAILABLE);
    },
  };
};
