import { render } from "vitest-browser-react";

import { StoryWrapper, buildContact } from "@/test/StoryWrapper";

import type { Company, Deal } from "../types";
import { priceLists } from "./quoteFixtures";

const company = (id: number, name: string) =>
  ({ id, name, sales_id: 0, logo: {} }) as unknown as Company;

// More than one page of a ReferenceInput (25): the 40th used to be unreachable.
const manyCompanies = Array.from({ length: 40 }, (_, index) =>
  company(index + 1, `Company ${String(index + 1).padStart(2, "0")}`),
);

const deal = (id: number, name: string, company_id: number) =>
  ({
    id,
    name,
    company_id,
    contact_ids: [],
    stage: "opportunity",
    sales_id: 0,
  }) as unknown as Deal;

const renderCreate = (data: Parameters<typeof StoryWrapper>[0]["data"]) =>
  render(
    <StoryWrapper data={data} initialEntries={["/quotes/create"]}>
      <></>
    </StoryWrapper>,
  );

describe("QuoteInputs", () => {
  it("finds a customer beyond the first page of companies", async () => {
    const screen = await renderCreate({
      companies: manyCompanies,
      price_lists: priceLists,
    });

    const companyInput = screen.getByRole("combobox", { name: "Company" });
    await companyInput.click();
    await screen.getByPlaceholder("Search").fill("Company 40");

    // Exact: the list also offers "Create Company 40", which a substring
    // match accepted before the search had returned anything.
    await expect
      .element(screen.getByRole("option", { name: "Company 40", exact: true }))
      .toBeVisible();
  });

  it("offers only the chosen company's contacts and deals", async () => {
    const screen = await renderCreate({
      companies: [company(1, "Acme"), company(2, "Globex")],
      contacts: [
        buildContact({
          id: 1,
          first_name: "Ada",
          last_name: "Acme",
          company_id: 1,
        }),
        buildContact({
          id: 2,
          first_name: "Gus",
          last_name: "Globex",
          company_id: 2,
        }),
      ],
      deals: [deal(1, "Acme renewal", 1), deal(2, "Globex expansion", 2)],
      price_lists: priceLists,
    });

    await screen.getByRole("combobox", { name: "Company" }).click();
    await screen.getByRole("option", { name: "Acme" }).click();

    await screen.getByRole("combobox", { name: "Contact" }).click();
    await expect.element(screen.getByText("Ada Acme")).toBeVisible();
    await expect
      .element(screen.getByText("Gus Globex"))
      .not.toBeInTheDocument();
    await screen.getByText("Ada Acme").click();

    await screen.getByRole("combobox", { name: "Deal" }).click();
    await expect
      .element(screen.getByRole("option", { name: "Acme renewal" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("option", { name: "Globex expansion" }))
      .not.toBeInTheDocument();
  });

  it("explains how to get a price list when there is none", async () => {
    const screen = await renderCreate({
      companies: [company(1, "Acme")],
      price_lists: [],
    });

    await expect
      .element(screen.getByRole("link", { name: "Create a price list" }))
      .toHaveAttribute("href", "/price_lists/create");
  });
});
