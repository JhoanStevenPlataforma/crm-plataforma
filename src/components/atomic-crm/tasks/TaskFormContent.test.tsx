import { Form } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { TaskFormContent } from "./TaskFormContent";

const DAY = 24 * 60 * 60 * 1000;
const WARNING = "This date has already passed: the task will show as overdue.";

const renderForm = (dueDate: string) =>
  render(
    <StoryWrapper>
      <Form defaultValues={{ title: "Call back", due_date: dueDate }}>
        <TaskFormContent />
      </Form>
    </StoryWrapper>,
  );

describe("TaskFormContent due date", () => {
  it("warns, without blocking, that a past due date makes the task overdue", async () => {
    const screen = await renderForm(
      new Date(Date.now() - 2 * DAY).toISOString(),
    );

    await expect.element(screen.getByText(WARNING)).toBeVisible();
  });

  it("stays quiet for a due date still ahead", async () => {
    const screen = await renderForm(
      new Date(Date.now() + 2 * DAY).toISOString(),
    );

    // Positive first, so the absence is not checked before the form renders.
    await expect.element(screen.getByLabelText(/^title/i)).toBeVisible();
    await expect.element(screen.getByText(WARNING)).not.toBeInTheDocument();
  });
});
