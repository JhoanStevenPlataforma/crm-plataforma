import { userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { DealStageChangeDialog } from "./DealStageChangeDialog";

const renderDialog = async (
  props: Partial<Parameters<typeof DealStageChangeDialog>[0]> = {},
) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  const screen = await render(
    <StoryWrapper>
      <DealStageChangeDialog
        open
        dealName="Renovación Acme"
        fromStage="opportunity"
        toStage="proposal-sent"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    </StoryWrapper>,
  );

  return { screen, onConfirm, onCancel };
};

describe("DealStageChangeDialog", () => {
  it("names both ends of the move, so the user knows what they are explaining", async () => {
    const { screen } = await renderDialog();

    await expect
      .element(screen.getByText("Move to Proposal Sent"))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(/Renovación Acme is moving from Opportunity to/),
      )
      .toBeVisible();
  });

  it("refuses to move the deal until a reason is written", async () => {
    const { screen, onConfirm } = await renderDialog();

    const confirm = screen.getByRole("button", { name: "Move deal" });
    await expect.element(confirm).toBeDisabled();

    // Whitespace is not a reason.
    await screen.getByRole("textbox").fill("   ");
    await expect.element(confirm).toBeDisabled();

    await screen.getByRole("textbox").fill("Propuesta enviada tras la visita");
    await expect.element(confirm).toBeEnabled();

    await confirm.click();

    expect(onConfirm).toHaveBeenCalledWith(
      "Propuesta enviada tras la visita",
      [],
    );
  });

  it("hands the attached files to the caller along with the reason", async () => {
    const { screen, onConfirm } = await renderDialog();

    const file = new File(["propuesta"], "propuesta.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(screen.getByLabelText(/attach files/i), file);

    await expect.element(screen.getByText("propuesta.pdf")).toBeVisible();

    await screen.getByRole("textbox").fill("Enviada la propuesta");
    await screen.getByRole("button", { name: "Move deal" }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [reason, files] = onConfirm.mock.calls[0];
    expect(reason).toBe("Enviada la propuesta");
    expect(files.map((picked: File) => picked.name)).toEqual(["propuesta.pdf"]);
  });

  it("lets a file be removed before the move is confirmed", async () => {
    const { screen, onConfirm } = await renderDialog();

    await userEvent.upload(
      screen.getByLabelText(/attach files/i),
      new File(["borrador"], "borrador.pdf", { type: "application/pdf" }),
    );

    await expect.element(screen.getByText("borrador.pdf")).toBeVisible();

    await screen.getByRole("button", { name: "Remove borrador.pdf" }).click();

    await expect
      .element(screen.getByText("borrador.pdf"))
      .not.toBeInTheDocument();

    await screen.getByRole("textbox").fill("Sin adjuntos al final");
    await screen.getByRole("button", { name: "Move deal" }).click();

    expect(onConfirm).toHaveBeenCalledWith("Sin adjuntos al final", []);
  });

  it("puts the card back when the move is dismissed", async () => {
    const { screen, onCancel } = await renderDialog();

    await screen.getByRole("button", { name: "Cancel" }).click();

    expect(onCancel).toHaveBeenCalled();
  });

  it("locks both buttons while the move is being written", async () => {
    const { screen } = await renderDialog({ isPending: true });

    await expect
      .element(screen.getByRole("button", { name: "Cancel" }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Move deal" }))
      .toBeDisabled();
  });
});
