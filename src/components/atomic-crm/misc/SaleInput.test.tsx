import { render } from "vitest-browser-react";

import { AsManager, AsSalesRep } from "./SaleInput.stories";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SaleInput", () => {
  it("lets a user who may reassign pick the owner", async () => {
    const screen = await render(<AsManager />);

    const trigger = screen.getByRole("combobox");
    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toBeEnabled();
  });

  it("is inert for a sales rep, who cannot create a record for somebody else", async () => {
    const screen = await render(<AsSalesRep />);

    const trigger = screen.getByRole("combobox");
    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toBeDisabled();
  });

  it("gives a sales rep no way to clear the owner either", async () => {
    // The reset button sets pointer-events-auto, so it stayed clickable on a
    // disabled trigger until it was hidden outright.
    const screen = await render(<AsSalesRep />);

    // The reset control only renders once the owner value has resolved, and
    // ReferenceInput resolves it asynchronously. Wait for the resolved name
    // first, otherwise the absence assertion below passes vacuously against a
    // form that has not finished rendering.
    await expect.element(screen.getByText("Raul Rep").first()).toBeVisible();

    await expect
      .element(screen.getByRole("button").first())
      .not.toBeInTheDocument();
  });
});
