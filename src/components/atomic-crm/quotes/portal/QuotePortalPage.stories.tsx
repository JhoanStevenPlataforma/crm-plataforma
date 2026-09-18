import type { Meta } from "@storybook/react-vite";
import { useMemo } from "react";

import { StoryWrapper } from "@/test/StoryWrapper";

import {
  QuotePortalClientProvider,
  type QuotePortalPayload,
} from "./quotePortalClient";
import {
  createFakeQuotePortal,
  PORTAL_TOKEN,
  portalPayload,
} from "./quotePortalFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Customer Portal",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type PortalOptions = Parameters<typeof createFakeQuotePortal>[0];

/**
 * The page through its REAL route, `/quote#<token>`, so every story also proves
 * the route is registered and opens with no session. Behind it is the fake
 * portal: no server, the server's refusal keys.
 */
const Portal = ({
  options,
  token = PORTAL_TOKEN,
}: {
  options?: PortalOptions;
  token?: string;
}) => {
  // One portal per story: a new one per render would forget an answer given.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const portal = useMemo(() => createFakeQuotePortal(options), []);
  return (
    <QuotePortalClientProvider value={portal.client}>
      <StoryWrapper initialEntries={[`/quote#${token}`]}>{null}</StoryWrapper>
    </QuotePortalClientProvider>
  );
};

/** A payload the status machine offers no answer, and no thread, on. */
const unanswerable = (
  overrides: Partial<QuotePortalPayload>,
): QuotePortalPayload => ({
  ...portalPayload,
  actions: { can_accept: false, can_reject: false, can_comment: false },
  ...overrides,
});

/** Sent, and waiting for an answer. */
export const Open = () => <Portal />;

/** Answered on an earlier visit. */
export const Accepted = () => (
  <Portal
    options={{
      payload: unanswerable({
        quote: { ...portalPayload.quote, status: "accepted" },
        acceptance: {
          accepted_at: "2026-09-12T10:00:00.000Z",
          accepted_by_name: "Lucía Gómez",
          rejected_at: null,
        },
      }),
    }}
  />
);

/** A link to version 1, opened after version 2 was issued. */
export const Superseded = () => (
  <Portal
    options={{
      payload: unanswerable({
        quote: {
          ...portalPayload.quote,
          version_number: 1,
          is_superseded: true,
        },
      }),
    }}
  />
);

/** Withdrawn by the rep: nothing to answer, somebody to call. */
export const Canceled = () => (
  <Portal
    options={{
      payload: unanswerable({
        quote: { ...portalPayload.quote, status: "canceled" },
      }),
    }}
  />
);

/** Nobody has written yet. */
export const NoComments = () => (
  <Portal options={{ payload: { ...portalPayload, comments: [] } }} />
);

/** The link has written as much as it may this hour. */
export const CommentRefused = () => (
  <Portal options={{ refuseCommentWith: "quote_portal_comment_limit" }} />
);

/** The answer arrives after a newer version was issued. */
export const AnswerRefused = () => (
  <Portal options={{ refuseAnswerWith: "quote_version_superseded" }} />
);

/** The server could not be reached. */
export const Unreachable = () => (
  <Portal options={{ refuseViewWith: "quote_portal_unavailable" }} />
);

/** A revoked, expired or mistyped link: one answer for all three. */
export const DeadLink = () => <Portal token={"0".repeat(64)} />;
