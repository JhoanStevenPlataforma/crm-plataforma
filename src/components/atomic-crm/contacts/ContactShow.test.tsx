import {
  ResourceContextProvider,
  ShowBase,
  useDataProvider,
  type DataProvider,
} from "ra-core";
import { render } from "vitest-browser-react";
import { buildContact, StoryWrapper } from "@/test/StoryWrapper";
import { ContactAside } from "./ContactAside";

// The status selector has a phone variant; these tests drive the desktop one.
vi.mock("@/hooks/use-mobile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => false,
}));

describe("ContactShow", () => {
  it("updates the contact status from the aside", async () => {
    let dataProvider: DataProvider | null = null;
    const contact = buildContact({ status: "warm" });

    const DataProviderListener = () => {
      dataProvider = useDataProvider();
      return null;
    };

    const screen = await render(
      <StoryWrapper data={{ contacts: [contact] }}>
        <DataProviderListener />
        <ResourceContextProvider value="contacts">
          <ShowBase id={contact.id}>
            <ContactAside />
          </ShowBase>
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveTextContent("Warm");

    await screen.getByRole("combobox").click();
    await screen.getByRole("option", { name: /hot/i }).click();

    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getOne("contacts", {
          id: contact.id,
        });
        return data.status;
      })
      .toBe("hot");

    await expect.element(screen.getByRole("combobox")).toHaveTextContent("Hot");
  });

  it("offers merge, vCard and delete on the contact's page", async () => {
    const contact = buildContact();

    const screen = await render(
      <StoryWrapper data={{ contacts: [contact] }}>
        <ResourceContextProvider value="contacts">
          <ShowBase id={contact.id}>
            <ContactAside />
          </ShowBase>
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("button", { name: /merge/i }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /vcard/i }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /delete/i }))
      .toBeVisible();
  });
});
