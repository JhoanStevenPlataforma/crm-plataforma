import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskComments } from "./TaskComments";
import type {
  TaskAttachment,
  TaskComment,
  TaskCommentReaction,
  TaskEvent,
} from "../types";

const task = buildTask({ id: 1, title: "Renovación Acme" });
// The task carries `contact_id: 1`, and the demo provider keeps that contact's
// task counter in step on every task write — so the contact has to exist.
const contact = buildContact({ id: 1 });

/** The signed-in user in tests, i.e. the author of anything posted here. */
const CURRENT_USER = 0;

const renderComments = async (
  comments: TaskComment[] = [],
  extra: Partial<{
    task_attachments: TaskAttachment[];
    task_comment_reactions: TaskCommentReaction[];
  }> = {},
) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper
      data={{
        tasks: [task],
        contacts: [contact],
        task_comments: comments,
        ...extra,
      }}
    >
      <Listener />
      <TaskComments taskId={1} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const buildComment = (overrides: Partial<TaskComment> = {}): TaskComment => ({
  id: 1,
  task_id: 1,
  parent_id: null,
  author_id: CURRENT_USER,
  body: "Llamé al cliente, sin respuesta.",
  is_private: false,
  edit_count: 0,
  edited_at: null,
  deleted_at: null,
  created_at: "2026-08-01T09:00:00.000Z",
  ...overrides,
});

// Each write fans out through the provider callbacks that stand in for the
// database triggers — counter, revision, event stream — so the visible effect
// lands a few round-trips after the click. Well past the 1 s poll default.
const SETTLE = { timeout: 15000 };

const listComments = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<TaskComment>("task_comments", {
    filter: { task_id: 1 },
    pagination: { page: 1, perPage: 25 },
    sort: { field: "id", order: "ASC" },
  });
  return data;
};

describe("TaskComments", () => {
  it("shows the discussion attached to the task", async () => {
    const { screen } = await renderComments([
      buildComment({ body: "Llamé al cliente, sin respuesta." }),
    ]);

    await expect
      .element(screen.getByText("Llamé al cliente, sin respuesta."))
      .toBeInTheDocument();
  });

  it("tells the user when nobody has commented yet", async () => {
    const { screen } = await renderComments([]);

    await expect
      .element(screen.getByText(/no comments yet/i))
      .toBeInTheDocument();
  });

  it("posts a comment against the task", async () => {
    const { screen, getDataProvider } = await renderComments([]);

    await screen
      .getByRole("textbox")
      .first()
      .fill("El cliente pide propuesta revisada");
    await screen.getByRole("button", { name: /^comment$/i }).click();

    await expect
      .poll(async () => {
        const comments = await listComments(getDataProvider());
        return comments.find(
          (comment) => comment.body === "El cliente pide propuesta revisada",
        );
      }, SETTLE)
      .toMatchObject({ task_id: 1 });
  });

  it("records the comment in the audit trail, like the database does", async () => {
    // The reason comments live in the CRM at all: the coordination has to end
    // up in the same event stream as every other change to the task (§8).
    const { screen, getDataProvider } = await renderComments([]);

    await screen.getByRole("textbox").first().fill("Reintento mañana");
    await screen.getByRole("button", { name: /^comment$/i }).click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskEvent>(
          "task_events",
          {
            filter: { task_id: 1 },
            pagination: { page: 1, perPage: 25 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data.find((event) => event.event_type === "comment.created");
      }, SETTLE)
      .toMatchObject({ note: "Reintento mañana" });
  });

  it("renders a mention as a name, never as its raw token", async () => {
    const { screen } = await renderComments([
      buildComment({ body: "@[Jane Doe](sales:1) ¿lo miras?" }),
    ]);

    await expect.element(screen.getByText("@Jane Doe")).toBeInTheDocument();
    await expect.element(screen.getByText(/sales:1/)).not.toBeInTheDocument();
  });

  it("marks an edited comment as edited", async () => {
    const { screen } = await renderComments([
      buildComment({ edit_count: 2, edited_at: "2026-08-02T09:00:00.000Z" }),
    ]);

    await expect.element(screen.getByText(/edited x2/i)).toBeInTheDocument();
  });

  it("shows a tombstone for a deleted comment instead of dropping it", async () => {
    // Deletion is soft (§8.2): a thread that silently loses a message is the
    // kind of unexplained gap the audit trail exists to remove.
    const { screen } = await renderComments([
      buildComment({
        body: "mensaje retirado",
        deleted_at: "2026-08-02T09:00:00.000Z",
      }),
    ]);

    await expect
      .element(screen.getByText(/comment deleted/i))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("mensaje retirado"))
      .not.toBeInTheDocument();
  });

  it("deletes a comment without destroying its body", async () => {
    const { screen, getDataProvider } = await renderComments([
      buildComment({ body: "me equivoqué" }),
    ]);

    await screen.getByRole("button", { name: /^delete$/i }).click();

    await expect
      .poll(
        async () => (await listComments(getDataProvider()))[0]?.deleted_at,
        SETTLE,
      )
      .not.toBeNull();

    // The row is still there, body intact — that is what "soft" means.
    const [stored] = await listComments(getDataProvider());
    expect(stored.body).toBe("me equivoqué");
  });

  it("keeps the previous body as a revision when a comment is edited", async () => {
    // "Edited" without the old text is not an audit trail (§8.2).
    const { screen, getDataProvider } = await renderComments([
      buildComment({ body: "sin respuesta" }),
    ]);

    await screen.getByRole("button", { name: /^edit$/i }).click();
    await screen.getByRole("textbox").first().fill("contestó el buzón");
    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList(
          "task_comment_revisions",
          {
            filter: {},
            pagination: { page: 1, perPage: 25 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data[0];
      }, SETTLE)
      .toMatchObject({ body: "sin respuesta", revision: 1 });
  });

  it("nests a reply under the comment it answers", async () => {
    const { screen, getDataProvider } = await renderComments([
      buildComment({ id: 7, body: "¿alguien lo ha intentado?" }),
    ]);

    await screen.getByRole("button", { name: /^reply$/i }).click();
    // The reply composer renders inside the thread, above the one at the
    // bottom of the panel, so it is the first of the two.
    await screen.getByRole("textbox").first().fill("Yo lo llamo mañana");
    await screen
      .getByRole("button", { name: /^comment$/i })
      .first()
      .click();

    await expect
      .poll(async () => {
        const comments = await listComments(getDataProvider());
        return comments.find(
          (comment) => comment.body === "Yo lo llamo mañana",
        );
      }, SETTLE)
      .toMatchObject({ parent_id: 7 });
  });

  it("shows the files sent with a comment under that comment", async () => {
    // A file dropped in a conversation belongs to the message that explains it.
    const { screen } = await renderComments(
      [buildComment({ id: 3, body: "Adjunto el contrato" })],
      {
        task_attachments: [
          {
            id: 1,
            task_id: 1,
            comment_id: 3,
            storage_path: "1/8f14e45f.pdf",
            file_name: "contrato.pdf",
            mime_type: "application/pdf",
            size_bytes: 24680,
            checksum: null,
            uploaded_by: CURRENT_USER,
            uploaded_at: "2026-08-01T09:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    );

    await expect.element(screen.getByText("contrato.pdf")).toBeInTheDocument();
  });

  it("acknowledges a comment with a reaction instead of a noise reply", async () => {
    // 👍 as a first-class "seen and agreed" signal (§8.2) — still an
    // attributed row, so the acknowledgement is in the audit trail.
    const { screen, getDataProvider } = await renderComments([
      buildComment({ id: 4, body: "Propuesta enviada" }),
    ]);

    await screen
      .getByRole("button", { name: /react to this comment/i })
      .click();
    await screen.getByRole("button", { name: /react with 👍/i }).click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskCommentReaction>(
          "task_comment_reactions",
          {
            filter: {},
            pagination: { page: 1, perPage: 25 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data[0];
      }, SETTLE)
      // The reactor comes from the session, exactly as the trigger stamps it.
      .toMatchObject({ comment_id: 4, emoji: "👍", sales_id: CURRENT_USER });

    // The event is written after the row, so it needs its own wait.
    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskEvent>(
          "task_events",
          {
            filter: { task_id: 1 },
            pagination: { page: 1, perPage: 25 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data.find(
          (event) => event.event_type === "comment.reaction_added",
        );
      }, SETTLE)
      .toMatchObject({ metadata: { comment_id: 4, emoji: "👍" } });
  });

  it("takes a reaction back when it is clicked again", async () => {
    const { screen, getDataProvider } = await renderComments(
      [buildComment({ id: 4, body: "Propuesta enviada" })],
      {
        task_comment_reactions: [
          {
            id: 1,
            comment_id: 4,
            sales_id: CURRENT_USER,
            emoji: "👍",
            created_at: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
    );

    await screen
      .getByRole("button", { name: /remove your 👍 reaction/i })
      .click();

    await expect
      .poll(async () => {
        const { total } = await getDataProvider().getList(
          "task_comment_reactions",
          {
            filter: {},
            pagination: { page: 1, perPage: 25 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return total;
      }, SETTLE)
      .toBe(0);
  });
});
