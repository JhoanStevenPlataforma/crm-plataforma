import { render } from "vitest-browser-react";

import { CustomRate, SeededRate } from "./TaxRateInputs.stories";

describe("TaxRateInputs", () => {
  it("keeps a seeded rate's code fixed while its label and rate stay editable", async () => {
    const screen = await render(<SeededRate />);

    await expect.element(screen.getByLabelText(/^Code/)).toBeDisabled();
    await expect.element(screen.getByText(/its code is fixed/)).toBeVisible();
    await expect.element(screen.getByLabelText(/^Label/)).toBeEnabled();
    await expect.element(screen.getByLabelText(/^Rate/)).toBeEnabled();
  });

  it("lets a manager change the code of a rate that was not seeded", async () => {
    const screen = await render(<CustomRate />);

    await expect.element(screen.getByLabelText(/^Code/)).toBeEnabled();
    await expect
      .element(screen.getByText(/its code is fixed/))
      .not.toBeInTheDocument();
  });
});
