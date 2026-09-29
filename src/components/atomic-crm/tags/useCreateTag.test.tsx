import { useState } from "react";
import { render } from "vitest-browser-react";

import { createCrmDb, StoryWrapper } from "@/test/StoryWrapper";

import { createDataProvider } from "../providers/fakerest";
import type { Tag } from "../types";
import { useCreateTag } from "./useCreateTag";

/** Creates one tag on click and prints the id it got back. */
const CreateTagButton = ({ name }: { name: string }) => {
  const createTag = useCreateTag();
  const [id, setId] = useState<string>();
  return (
    <>
      <button
        onClick={async () =>
          setId(String((await createTag({ name, color: "#eee" })).id))
        }
      >
        Create {name}
      </button>
      {id ? <p>Tag {id}</p> : null}
    </>
  );
};

/**
 * M3 (QA audit): typing "VIP" when "vip" existed created a second tag, and a
 * contact could end up wearing both ("vip vip").
 */
describe("useCreateTag", () => {
  it("returns the existing tag when the name differs only in case and spaces", async () => {
    // Arrange
    const dataProvider = createDataProvider({
      db: createCrmDb({ tags: [{ id: 7, name: "vip", color: "#eee" }] }),
      latency: 0,
    });
    const screen = await render(
      <StoryWrapper dataProvider={dataProvider}>
        <CreateTagButton name=" VIP " />
      </StoryWrapper>,
    );

    // Act
    await screen.getByRole("button", { name: "Create VIP" }).click();

    // Assert
    await expect.element(screen.getByText("Tag 7")).toBeVisible();
    const { total } = await dataProvider.getList<Tag>("tags", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    expect(total).toBe(1);
  });

  it("creates a tag whose name is new", async () => {
    const dataProvider = createDataProvider({
      db: createCrmDb({ tags: [{ id: 7, name: "vip", color: "#eee" }] }),
      latency: 0,
    });
    const screen = await render(
      <StoryWrapper dataProvider={dataProvider}>
        <CreateTagButton name="prospect" />
      </StoryWrapper>,
    );

    await screen.getByRole("button", { name: "Create prospect" }).click();

    await expect.element(screen.getByText(/^Tag \d+$/)).toBeVisible();
    await expect.element(screen.getByText("Tag 7")).not.toBeInTheDocument();
  });
});
