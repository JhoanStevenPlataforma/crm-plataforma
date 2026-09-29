import { ResourceContextProvider } from "ra-core";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { buildContact, StoryWrapper } from "@/test/StoryWrapper";
import { ContactList } from "./ContactList";

import {
  DesktopEmpty,
  DesktopSuccess,
  DesktopLoading,
  DesktopError,
  BulkTagButton,
} from "./ContactList.stories";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContactList", () => {
  it("renders an invite to create the first contact when the app is empty", async () => {
    const screen = await render(<DesktopEmpty />);
    await expect
      .element(screen.getByRole("heading", { name: "No contacts found" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("It seems your contact list is empty."))
      .toBeVisible();
  });

  it("names a remembered tag filter above the list, even past the first page of tags", async () => {
    // Eleven tags sort before "QA", so it is not among the ten the sidebar
    // lists: the chip is the only place the filter shows.
    const tags = [
      ...Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        name: `A${String(index).padStart(2, "0")}`,
        color: "#eee",
      })),
      { id: 12, name: "QA", color: "#eee" },
    ];
    const filter = encodeURIComponent(JSON.stringify({ "tags@cs": "{12}" }));
    const screen = await render(
      <StoryWrapper
        data={{
          tags,
          contacts: [buildContact({ id: 1, first_name: "Ada", tags: [12] })],
        }}
        initialEntries={[`/?filter=${filter}`]}
      >
        <ResourceContextProvider value="contacts">
          <ContactList />
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await expect.element(screen.getByText("Active filters:")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^QA/ }))
      .toBeVisible();
  });

  it("folds the filters behind a button when a side panel would squeeze the list", async () => {
    // Arrange: a ~900px window, where the navigation plus a side panel left
    // the list a word per line.
    await page.viewport(900, 800);
    try {
      // Act
      const screen = await render(<DesktopSuccess />);

      // Assert
      await expect
        .element(screen.getByRole("button", { name: "Add filter" }))
        .toBeVisible();
    } finally {
      await page.viewport(1440, 900);
    }
  });

  it("keeps the filter panel beside a wide list", async () => {
    await page.viewport(1440, 900);

    const screen = await render(<DesktopSuccess />);

    await expect.element(screen.getByText("Hot")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add filter" }))
      .not.toBeInTheDocument();
  });

  it("renders contacts in a list", async () => {
    const screen = await render(<DesktopSuccess />);

    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    await expect.element(screen.getByText("Grace Hopper")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No contacts found" }))
      .not.toBeInTheDocument();
  });

  /**
   * The desktop version doesn't show a skeleton yet
   */
  it.skip("renders a skeleton while loading", async () => {
    const screen = await render(<DesktopLoading />);

    await expect
      .poll(() => screen.container.querySelector('[data-slot="skeleton"]'))
      .not.toBeNull();
  });

  it("renders an error notification when loading contacts fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = await render(<DesktopError />);

    await expect
      .element(screen.getByText("Error loading contacts"))
      .toBeVisible();
  });

  it("shows the bulk tag button only after selecting contacts", async () => {
    const screen = await render(<BulkTagButton />);

    await expect
      .element(screen.getByRole("button", { name: /^tag$/i }))
      .not.toBeInTheDocument();

    await expect
      .poll(() => getSelectionCheckboxes(screen.container).length)
      .toBe(2);

    const [selectionCheckbox] = getSelectionCheckboxes(screen.container);
    await selectionCheckbox.click();

    await expect
      .element(screen.getByRole("button", { name: /^tag$/i }))
      .toBeVisible();
  });

  it("adds an existing tag to selected contacts without duplicating it", async () => {
    const screen = await render(<BulkTagButton />);

    await expect
      .poll(() => getSelectionCheckboxes(screen.container).length)
      .toBe(2);

    const checkboxes = getSelectionCheckboxes(screen.container);
    await checkboxes[0].click();
    await checkboxes[1].click();

    await screen.getByRole("button", { name: /^tag$/i }).click();
    await screen.getByRole("button", { name: "VIP" }).click();

    await expect
      .element(screen.getByText("Tag added to 1 contact"))
      .toBeInTheDocument();
    await expect
      .poll(() => screen.getByText("VIP").all().length)
      .toBeGreaterThanOrEqual(2);
    // close the notification
    await screen.getByRole("button", { name: /close/i }).click();
  });

  it("creates a new tag inline and applies it to the full selected list", async () => {
    const screen = await render(<BulkTagButton />);

    await expect
      .poll(() => getSelectionCheckboxes(screen.container).length)
      .toBe(2);

    const checkboxes = getSelectionCheckboxes(screen.container);
    await checkboxes[0].click();
    await checkboxes[1].click();

    await screen.getByRole("button", { name: /^Tag$/ }).click();
    await screen.getByRole("button", { name: /Create new tag/ }).click();

    await expect
      .element(
        screen.getByText(
          "Create a new tag and apply it to the selected contacts.",
        ),
      )
      .toBeVisible();

    await screen.getByLabelText("Tag name").fill("Prospect");
    await screen.getByRole("button", { name: /^Save$/ }).click();

    await expect
      .element(screen.getByText("Tag added to 2 contacts"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Prospect").first()).toBeVisible();
    // close the notification
    await screen.getByRole("button", { name: /close/i }).click();
  });
});

const getSelectionCheckboxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-slot="checkbox"]')).map(
    (element) => element as HTMLElement,
  );
