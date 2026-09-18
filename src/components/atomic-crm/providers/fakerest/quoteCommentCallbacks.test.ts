import { describe, expect, test } from "vitest";

import { createCrmDb } from "@/test/StoryWrapper";
import {
  commentAuthors,
  quoteComments,
  quoteVersions,
  quotes,
} from "../../quotes/quoteFixtures";
import type { QuoteComment } from "../../types";
import { createDataProvider } from ".";

/**
 * The demo mirror of the `quote_comments` triggers must refuse what the
 * database refuses (`quote_comments.test.sql`), or demo mode teaches a rep
 * moves the real backend will not let them make. The signed-in user is the
 * demo's default user, id 0.
 */
const buildProvider = () =>
  createDataProvider({
    db: createCrmDb({
      quotes,
      quote_versions: quoteVersions,
      sales: commentAuthors,
      quote_comments: quoteComments,
    }),
    latency: 0,
    silent: true,
  });

const commentOf = async (
  dataProvider: ReturnType<typeof buildProvider>,
  id: number,
) => (await dataProvider.getOne<QuoteComment>("quote_comments", { id })).data;

describe("quoteCommentCallbacks", () => {
  test("signs a comment with the session, dates it on the server's clock, and keeps the thread one level deep", async () => {
    const dataProvider = buildProvider();

    const { data: comment } = await dataProvider.create<QuoteComment>(
      "quote_comments",
      {
        data: {
          quote_id: 1,
          parent_id: 3,
          body: "Delivery confirms the 6th.",
          author_sales_id: 7,
          created_at: "2020-01-01T00:00:00.000Z",
        },
      },
    );

    expect(comment.parent_id).toBe(2);
    expect(comment.author_sales_id).toBe(0);
    expect(comment.author_kind).toBe("internal");
    expect(comment.visibility).toBe("internal");
    expect(comment.currency).toBe("COP");
    expect(comment.created_at > "2020-01-02").toBe(true);
  });

  test("stamps an edit and a soft delete, and refuses to change the audience or revive a tombstone", async () => {
    const dataProvider = buildProvider();
    const note = await commentOf(dataProvider, 1);

    await expect(
      dataProvider.update("quote_comments", {
        id: 1,
        data: { visibility: "shared" },
        previousData: note,
      }),
    ).rejects.toThrow("quote_comment_column_protected");

    await dataProvider.update("quote_comments", {
      id: 1,
      data: { body: "Stock confirmed." },
      previousData: note,
    });
    expect((await commentOf(dataProvider, 1)).edited_at).not.toBeNull();

    await dataProvider.update("quote_comments", {
      id: 1,
      data: { deleted_at: "2020-01-01T00:00:00.000Z" },
      previousData: note,
    });
    const deleted = await commentOf(dataProvider, 1);
    expect(deleted.deleted_at! > "2020-01-02").toBe(true);

    await expect(
      dataProvider.update("quote_comments", {
        id: 1,
        data: { body: "Back again" },
        previousData: deleted,
      }),
    ).rejects.toThrow("quote_comment_column_protected");
  });

  test("never rewrites a customer's words, and marks them read once", async () => {
    const dataProvider = buildProvider();
    const question = await commentOf(dataProvider, 2);

    await expect(
      dataProvider.update("quote_comments", {
        id: 2,
        data: { body: "We accept as is." },
        previousData: question,
      }),
    ).rejects.toThrow("quote_comment_column_protected");

    await expect(dataProvider.markQuoteCommentsRead(1)).resolves.toBe(1);
    await expect(dataProvider.markQuoteCommentsRead(1)).resolves.toBe(0);
    expect(
      (await commentOf(dataProvider, 2)).read_by_internal_at,
    ).not.toBeNull();
  });
});
