import fakeRestDataProvider from "ra-data-fakerest";
import type { DataProvider } from "ra-core";

import type { EmailMessage, SendEmailInput } from "../../types";
import { EMAIL_ERROR, EmailRpcError } from "../commons/emailRpc";
import { DEMO_QUOTE_STATUSES } from "./dataGenerator/quoteStatuses";
import { createDemoEmailMethods } from "./email";

/**
 * The demo's mirror of the email RPCs must apply the rules
 * `email_queue.test.sql` and `email_quote.test.sql` pin on the real functions
 * -- and must never record a message as anything but simulated.
 */
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const setup = (role: "rep" | "manager" | "admin" = "rep") => {
  const dataProvider = fakeRestDataProvider(
    {
      configuration: [{ id: 1, config: { title: "Acme" } }],
      sales: [
        {
          id: 1,
          first_name: "Olga",
          last_name: "Owner",
          email: "olga@crm.test",
          role,
        },
      ],
      companies: [{ id: 1, name: "Cliente Correo" }],
      contacts: [
        {
          id: 1,
          first_name: "Ana",
          last_name: "Compras",
          company_id: 1,
          email_jsonb: [{ email: "Ana@Cliente.test", type: "Work" }],
        },
        {
          id: 2,
          first_name: "Beto",
          last_name: "Finanzas",
          company_id: 1,
          email_jsonb: [{ email: "beto@cliente.test", type: "Work" }],
        },
      ],
      leads: [
        {
          id: 1,
          first_name: "Lia",
          email: "lia@prospecto.test",
          status: "new",
        },
      ],
      deals: [{ id: 1, name: "Negocio", company_id: 1, contact_ids: [1] }],
      quote_statuses: DEMO_QUOTE_STATUSES,
      quotes: [
        // 1: issued and live. 2: never issued. 3: under revision. 4: lapsed.
        ...[
          [1, "sent"],
          [2, "draft"],
          [3, "draft"],
          [4, "sent"],
          [5, "canceled"],
        ].map(([id, status]) => ({
          id,
          quote_number: `Q-2026-0000${id}`,
          title: "Propuesta",
          company_id: 1,
          contact_id: 1,
          currency: "COP",
          status_key: status,
        })),
      ],
      quote_versions: [
        version(10, 1, 1, { issued_at: "2026-10-01T10:00:00Z" }),
        version(20, 2, 1, {}),
        version(30, 3, 1, {
          issued_at: "2026-10-01T10:00:00Z",
        }),
        version(31, 3, 2, {}),
        version(40, 4, 1, {
          issued_at: "2026-10-01T10:00:00Z",
          valid_until: YESTERDAY,
        }),
        version(50, 5, 1, { issued_at: "2026-10-01T10:00:00Z" }),
      ],
      email_messages: [],
      email_suppressions: [],
    },
    false,
  ) as DataProvider;

  return {
    dataProvider,
    methods: createDemoEmailMethods(
      () => dataProvider,
      async () => 1,
    ),
  };
};

function version(
  id: number,
  quoteId: number,
  number: number,
  overrides: Record<string, unknown>,
) {
  return {
    id,
    quote_id: quoteId,
    version_number: number,
    currency: "COP",
    issued_at: null,
    superseded_at: null,
    accepted_at: null,
    rejected_at: null,
    valid_until: TOMORROW,
    total: 642600,
    party_snapshot: {
      company: { name: "Cliente Correo" },
      contact: { first_name: "Ana", last_name: "Compras" },
    },
    ...overrides,
  };
}

const quoteMessage = (
  overrides: Partial<SendEmailInput> = {},
): SendEmailInput => ({
  entityType: "quote",
  entityId: 1,
  quoteVersionId: 10,
  toEmail: "ana@cliente.test",
  subject: "Cotización",
  body: "Hola: {{quote_link}}",
  idempotencyKey: "key-1",
  ...overrides,
});

const refusal = async (attempt: Promise<unknown>) => {
  try {
    await attempt;
  } catch (error) {
    return error instanceof EmailRpcError ? error : null;
  }
  return null;
};

const messagesIn = async (dataProvider: DataProvider) =>
  (
    await dataProvider.getList<EmailMessage>("email_messages", {
      filter: {},
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
    })
  ).data;

describe("the demo email mirror", () => {
  it("records a shared quotation as simulated, on its exact version, with the frozen figures", async () => {
    // Arrange
    const { methods } = setup();

    // Act
    const message = await methods.sendEmail(quoteMessage());

    // Assert
    expect(message).toMatchObject({
      status: "simulated",
      provider_key: "mock",
      accepted_at: null,
      delivered_at: null,
      entity_type: "quote",
      quote_id: 1,
      quote_version_id: 10,
      to_email: "ana@cliente.test",
      contact_id: 1,
    });
    expect(message.variables).toMatchObject({
      quote_number: "Q-2026-00001",
      quote_version: 1,
      total: 642600,
      currency: "COP",
      customer_company: "Cliente Correo",
    });
  });

  it("leaves the quotation exactly as it was", async () => {
    const { methods, dataProvider } = setup();
    const before = JSON.stringify([
      (await dataProvider.getOne("quotes", { id: 1 })).data,
      (await dataProvider.getOne("quote_versions", { id: 10 })).data,
    ]);

    await methods.sendEmail(quoteMessage());

    expect(
      JSON.stringify([
        (await dataProvider.getOne("quotes", { id: 1 })).data,
        (await dataProvider.getOne("quote_versions", { id: 10 })).data,
      ]),
    ).toBe(before);
  });

  it("returns the same message for the same press of Send", async () => {
    const { methods, dataProvider } = setup();

    const first = await methods.sendEmail(quoteMessage());
    const second = await methods.sendEmail(quoteMessage());

    expect(second.id).toBe(first.id);
    expect(await messagesIn(dataProvider)).toHaveLength(1);
  });

  it("asks before sending the same version to the same address again", async () => {
    const { methods, dataProvider } = setup();
    await methods.sendEmail(quoteMessage());

    const again = await refusal(
      methods.sendEmail(quoteMessage({ idempotencyKey: "key-2" })),
    );
    await methods.sendEmail(
      quoteMessage({ idempotencyKey: "key-2", confirmDuplicate: true }),
    );

    expect(again?.key).toBe(EMAIL_ERROR.duplicateRecent);
    expect(await messagesIn(dataProvider)).toHaveLength(2);
  });

  it.each([
    [2, 20, "quote_not_issued"],
    [3, 30, "quote_revision_open"],
    [4, 40, "version_expired"],
    [5, 50, "quote_closed"],
  ])(
    "refuses to share quote %i and says why (%s)",
    async (quoteId, versionId, block) => {
      const { methods, dataProvider } = setup();

      const error = await refusal(
        methods.sendEmail(
          quoteMessage({ entityId: quoteId, quoteVersionId: versionId }),
        ),
      );

      expect(error?.key).toBe(EMAIL_ERROR.quoteNotShareable);
      expect(error?.block).toBe(block);
      expect(await messagesIn(dataProvider)).toHaveLength(0);
    },
  );

  it("tells the dialog the same thing before anybody presses Send", async () => {
    const { methods } = setup();

    const live = await methods.getEmailContext("quote", 1);
    const revising = await methods.getEmailContext("quote", 3);
    const draft = await methods.getEmailContext("quote", 2);

    expect(live.quote).toEqual({
      version_id: 10,
      version_number: 1,
      block: null,
    });
    expect(revising.quote?.block).toBe("quote_revision_open");
    expect(draft.quote).toEqual({
      version_id: null,
      version_number: null,
      block: "quote_not_issued",
    });
    expect(live.recipients.map((recipient) => recipient.email)).toEqual([
      "ana@cliente.test",
      "beto@cliente.test",
    ]);
    expect(live.status).toMatchObject({
      is_simulated: true,
      can_send_any: false,
    });
  });

  it("lets a rep write only to the record's addresses, and a manager to any", async () => {
    const asRep = setup("rep");
    const asManager = setup("manager");
    const free = quoteMessage({ toEmail: "alguien@otra.test" });

    const refused = await refusal(asRep.methods.sendEmail(free));
    const sent = await asManager.methods.sendEmail(free);

    expect(refused?.key).toBe(EMAIL_ERROR.recipientNotAllowed);
    expect(sent).toMatchObject({
      to_email: "alguien@otra.test",
      contact_id: null,
    });
  });

  it("refuses a variable nobody filled, and the link outside a quotation's text", async () => {
    const { methods } = setup();

    const unfilled = await refusal(
      methods.sendEmail(quoteMessage({ body: "Total {{total}}" })),
    );
    const inSubject = await refusal(
      methods.sendEmail(quoteMessage({ subject: "Ver {{quote_link}}" })),
    );
    const onContact = await refusal(
      methods.sendEmail({
        entityType: "contact",
        entityId: 1,
        toEmail: "ana@cliente.test",
        subject: "Hola",
        body: "Ver {{quote_link}}",
        idempotencyKey: "key-3",
      }),
    );

    expect(unfilled?.key).toBe(EMAIL_ERROR.unresolvedVariable);
    expect(inSubject?.key).toBe(EMAIL_ERROR.unresolvedVariable);
    expect(onContact?.key).toBe(EMAIL_ERROR.unresolvedVariable);
  });

  it("refuses an address or a subject that could carry a header", async () => {
    const { methods } = setup("manager");

    const address = await refusal(
      methods.sendEmail(
        quoteMessage({ toEmail: "ana@cliente.test\nBcc: x@y.test" }),
      ),
    );
    const subject = await refusal(
      methods.sendEmail(quoteMessage({ subject: "Hola\r\nBcc: x@y.test" })),
    );

    expect(address?.key).toBe(EMAIL_ERROR.recipientInvalid);
    expect(subject?.key).toBe(EMAIL_ERROR.subjectInvalid);
  });

  it("writes from a lead and a deal to their own addresses", async () => {
    const { methods } = setup();

    const lead = await methods.getEmailContext("lead", 1);
    const deal = await methods.getEmailContext("deal", 1);

    expect(lead.recipients).toEqual([
      {
        email: "lia@prospecto.test",
        name: "Lia",
        contact_id: null,
        is_suppressed: false,
      },
    ]);
    expect(deal.recipients.map((recipient) => recipient.email)).toEqual([
      "ana@cliente.test",
    ]);
    expect(deal.variables.deal_name).toBe("Negocio");
  });

  it("refuses an address on the suppression list, and tells the dialog first", async () => {
    const { methods, dataProvider } = setup();
    await dataProvider.create("email_suppressions", {
      data: { email: "ana@cliente.test", reason: "hard_bounce" },
    });

    const context = await methods.getEmailContext("quote", 1);
    const refused = await refusal(methods.sendEmail(quoteMessage()));

    expect(
      context.recipients.map((recipient) => [
        recipient.email,
        recipient.is_suppressed,
      ]),
    ).toEqual([
      ["ana@cliente.test", true],
      ["beto@cliente.test", false],
    ]);
    expect(refused?.key).toBe(EMAIL_ERROR.recipientSuppressed);
    expect(await messagesIn(dataProvider)).toHaveLength(0);
  });

  it("lists the variables a template of each scope may name", async () => {
    const { methods } = setup();

    expect(await methods.getEmailTemplateVariables("contact")).not.toContain(
      "quote_link",
    );
    expect(await methods.getEmailTemplateVariables("deal")).toContain(
      "deal_name",
    );
    expect(await methods.getEmailTemplateVariables("quote")).toEqual(
      expect.arrayContaining(["quote_number", "total", "quote_link"]),
    );
  });

  it("keeps the test message for administrators", async () => {
    const test: SendEmailInput = {
      entityType: null,
      entityId: null,
      toEmail: "prueba@crm.test",
      subject: "Prueba",
      body: "Hola",
      idempotencyKey: "key-4",
    };

    const refused = await refusal(setup("manager").methods.sendEmail(test));
    const sent = await setup("admin").methods.sendEmail(test);

    expect(refused?.key).toBe(EMAIL_ERROR.forbidden);
    expect(sent).toMatchObject({ origin: "test", status: "simulated" });
  });
});
