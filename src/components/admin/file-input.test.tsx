import { Form } from "ra-core";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { FileField } from "./file-field";
import { FileInput } from "./file-input";

const pick = (input: HTMLInputElement, file: File) => {
  // Built in the page: the upload helper refuses buffers over 50 MB, which is
  // exactly the size this has to exceed.
  const picked = new DataTransfer();
  picked.items.add(file);
  input.files = picked.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("FileInput size limit", () => {
  it("says which file was refused for exceeding the Storage limit", async () => {
    const screen = await render(
      <StoryWrapper>
        <Form>
          <FileInput source="attachments" multiple>
            <FileField source="src" title="title" />
          </FileInput>
        </Form>
      </StoryWrapper>,
    );

    const input = screen.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    pick(
      input,
      new File([new Uint8Array(51 * 1024 * 1024)], "demo.mov", {
        type: "video/quicktime",
      }),
    );

    await expect
      .element(
        page.getByText("demo.mov is larger than 50 MB and was not attached"),
      )
      .toBeVisible();
    await expect.element(screen.getByText("demo.mov")).not.toBeInTheDocument();
  });
});
