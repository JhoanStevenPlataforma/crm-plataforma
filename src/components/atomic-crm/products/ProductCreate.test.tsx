import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { createCrmDb, StoryWrapper } from "@/test/StoryWrapper";

import { createDataProvider } from "../providers/fakerest";
import type { Product } from "../types";

/**
 * M9 (QA audit): the list price took whole numbers only, so 19.99 could not
 * be entered.
 */
describe("ProductCreate", () => {
  it("keeps the cents of a list price", async () => {
    // Arrange
    await page.viewport(1440, 900);
    const dataProvider = createDataProvider({
      db: createCrmDb(),
      latency: 0,
    });
    const screen = await render(
      <StoryWrapper
        initialEntries={["/products/create"]}
        dataProvider={dataProvider}
      >
        {null}
      </StoryWrapper>,
    );

    // Act
    await screen.getByLabelText(/SKU/).fill("CENTS-1");
    await screen.getByLabelText(/^Name/).fill("Priced to the cent");
    const price = screen.getByLabelText(/List price/);
    await price.fill("19.99");
    await screen.getByRole("button", { name: "Save" }).click();

    // Assert: saved, with the cents.
    await expect
      .poll(async () => {
        const { data } = await dataProvider.getList<Product>("products", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
        });
        return data.map((product) => Number(product.list_price));
      })
      .toEqual([19.99]);
  });
});
