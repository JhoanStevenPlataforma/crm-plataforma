import { userEvent } from "vitest/browser";
import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskAttachments } from "./TaskAttachments";
import type { Task, TaskAttachment, TaskEvent } from "../types";

const task = buildTask({ id: 1, title: "Preparar la renovación" });
const contact = buildContact({ id: 1 });

// Each write fans out through the callbacks standing in for the database
// triggers — the counter, then the event stream — so effects land several
// round-trips after the click.
const SETTLE = { timeout: 15000 };

const buildAttachment = (
  overrides: Partial<TaskAttachment> = {},
): TaskAttachment => ({
  id: 1,
  task_id: 1,
  comment_id: null,
  storage_path: "1/8f14e45f.pdf",
  file_name: "contrato.pdf",
  mime_type: "application/pdf",
  size_bytes: 24680,
  checksum: null,
  uploaded_by: 0,
  uploaded_at: "2026-08-01T09:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

const renderAttachments = async (attachments: TaskAttachment[] = []) => {
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
        task_attachments: attachments,
      }}
    >
      <Listener />
      <TaskAttachments taskId={1} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const listAttachments = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<TaskAttachment>(
    "task_attachments",
    {
      filter: { task_id: 1 },
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
    },
  );
  return data;
};

describe("TaskAttachments", () => {
  it("lists the files already attached to the task", async () => {
    const { screen } = await renderAttachments([
      buildAttachment({ id: 1, file_name: "contrato.pdf" }),
      buildAttachment({
        id: 2,
        file_name: "anexo.xlsx",
        storage_path: "1/2b1f3c.xlsx",
      }),
    ]);

    await expect.element(screen.getByText("contrato.pdf")).toBeInTheDocument();
    await expect.element(screen.getByText("anexo.xlsx")).toBeInTheDocument();
    // How big it is, before deciding to open it on a phone.
    await expect.element(screen.getByText("25kB").first()).toBeInTheDocument();
  });

  it("tells the user when nothing is attached yet", async () => {
    const { screen } = await renderAttachments([]);

    await expect.element(screen.getByText(/no files yet/i)).toBeInTheDocument();
  });

  it("leaves comment attachments to the thread", async () => {
    // A file dropped in a conversation belongs to that message: showing it in
    // the flat list too would strip the reason it was sent.
    const { screen } = await renderAttachments([
      buildAttachment({ id: 1, file_name: "contrato.pdf" }),
      buildAttachment({
        id: 2,
        file_name: "captura.png",
        comment_id: 7,
        storage_path: "1/9c0f2a.png",
      }),
    ]);

    await expect.element(screen.getByText("contrato.pdf")).toBeInTheDocument();
    await expect
      .element(screen.getByText("captura.png"))
      .not.toBeInTheDocument();
  });

  it("stores a picked file under its task and records who uploaded it", async () => {
    const { screen, getDataProvider } = await renderAttachments([]);

    await userEvent.upload(
      screen.getByLabelText(/add files/i),
      new File(["contract bytes"], "contrato.pdf", {
        type: "application/pdf",
      }),
    );

    await expect
      .poll(async () => (await listAttachments(getDataProvider()))[0], SETTLE)
      .toMatchObject({
        task_id: 1,
        file_name: "contrato.pdf",
        mime_type: "application/pdf",
        // The uploader comes from the session, never from the form.
        uploaded_by: 0,
        comment_id: null,
      });

    // The task id leads the storage path: the storage policy reads it back out
    // to decide who may download the object (§17.3).
    const [stored] = await listAttachments(getDataProvider());
    expect(stored.storage_path.startsWith("1/")).toBe(true);
    expect(stored.size_bytes).toBe(14);
  });

  it("keeps the task's attachment counter in step", async () => {
    // The list view reads the counter instead of this table (§3.4), so it has
    // to follow every upload.
    const { screen, getDataProvider } = await renderAttachments([]);

    await userEvent.upload(
      screen.getByLabelText(/add files/i),
      new File(["bytes"], "anexo.pdf", { type: "application/pdf" }),
    );

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getOne<Task>("tasks", {
          id: 1,
        });
        return data.attachment_count;
      }, SETTLE)
      .toBe(1);
  });

  it("puts every upload in the audit trail", async () => {
    const { screen, getDataProvider } = await renderAttachments([]);

    await userEvent.upload(
      screen.getByLabelText(/add files/i),
      new File(["bytes"], "contrato.pdf", { type: "application/pdf" }),
    );

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskEvent>(
          "task_events",
          {
            filter: { task_id: 1 },
            pagination: { page: 1, perPage: 50 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data.find((event) => event.event_type === "attachment.added");
      }, SETTLE)
      .toMatchObject({ metadata: { file_name: "contrato.pdf" } });
  });

  it("removes a file without destroying its record", async () => {
    const { screen, getDataProvider } = await renderAttachments([
      buildAttachment({ id: 1, file_name: "contrato.pdf" }),
    ]);

    await screen.getByRole("button", { name: /remove contrato\.pdf/i }).click();

    // Poll on the EVENT, not on the row: the row is written first, so waiting
    // for `deleted_at` lets the assertion run before the event exists.
    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskEvent>(
          "task_events",
          {
            filter: { task_id: 1 },
            pagination: { page: 1, perPage: 50 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data.find((event) => event.event_type === "attachment.removed");
      }, SETTLE)
      .toMatchObject({ metadata: { file_name: "contrato.pdf" } });

    // Soft delete: the row stays, so the `attachment.removed` event still
    // resolves the file it refers to.
    const [removed] = await listAttachments(getDataProvider());
    expect(removed.deleted_at).not.toBeNull();
    expect(removed.file_name).toBe("contrato.pdf");
  });
});
