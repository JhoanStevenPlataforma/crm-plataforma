import { useState } from "react"
import { describe, expect, it } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import { StoryWrapper } from "@/test/StoryWrapper"

import { Dialog, DialogContent, DialogTitle } from "./dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"

/** The pattern of a task row: a "more" menu whose item opens a dialog. */
const MenuThatOpensADialog = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Row actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setOpen(true)}>
            Cancel task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Why cancel?</DialogTitle>
          <textarea aria-label="Reason" />
        </DialogContent>
      </Dialog>
    </>
  )
}

describe("DialogContent focus return", () => {
  it("gives focus back to the menu's trigger, not to the page, when closed", async () => {
    const screen = await render(
      <StoryWrapper>
        <MenuThatOpensADialog />
      </StoryWrapper>
    )

    await screen.getByRole("button", { name: "Row actions" }).click()
    await screen.getByRole("menuitem", { name: "Cancel task" }).click()
    await expect
      .element(screen.getByRole("dialog", { name: "Why cancel?" }))
      .toBeVisible()

    await userEvent.keyboard("{Escape}")

    await expect
      .element(screen.getByRole("dialog", { name: "Why cancel?" }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole("button", { name: "Row actions" }))
      .toHaveFocus()
  })
})
