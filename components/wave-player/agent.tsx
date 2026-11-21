"use client"

// One bridge for every WavePlayer route. A step on a control marked
// data-agent-confirm waits for the person's answer in a dialog the agent
// can't see. The person's click on Allow also counts as their gesture, so a
// control that opens a file picker still opens it.

import * as React from "react"
import { createAgent, registerTools } from "@ui-sdk/react/agent"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createAlertDialogController,
} from "@ui-sdk/react/alert-dialog"

import { buttonVariants } from "@/components/ui/button"

const ALLOW = "allow"

const ask = createAlertDialogController<string>()

async function askThePerson(confirm: string, signal: AbortSignal): Promise<boolean> {
  const answer = await ask.open({ payload: confirm, signal })

  return answer.returnValue === ALLOW
}

export const agent = createAgent({
  allow: (step, { signal }) => (step.confirm ? askThePerson(step.confirm, signal) : true),
})

export function WavePlayerAgent() {
  React.useEffect(() => {
    try {
      // The bridge has already asked the person, so asking here would ask twice.
      return registerTools(agent, { allow: () => true })
    } catch {
      return undefined
    }
  }, [])

  return (
    <AlertDialog controller={ask}>
      <AlertDialogBackdrop className="fixed inset-0 bg-background/60 transition-opacity duration-(--duration-small) data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <AlertDialogContent<string>
        data-agent-hidden=""
        className="fixed top-1/2 left-1/2 flex w-[min(22rem,calc(100vw-2rem))] -translate-1/2 flex-col gap-3 bg-popover p-4 text-popover-foreground shadow-float ring-1 ring-foreground/10 transition-opacity duration-(--duration-small) data-ending-style:opacity-0 data-starting-style:opacity-0"
      >
        {(state) => (
          <>
            <AlertDialogTitle className="type-heading-3">Let the agent do this?</AlertDialogTitle>
            <AlertDialogDescription className="type-body text-muted-foreground">
              {state.payload}
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogClose className={buttonVariants({ variant: "secondary" })}>
                Don&apos;t allow
              </AlertDialogClose>
              <AlertDialogClose value={ALLOW} className={buttonVariants()}>
                Allow
              </AlertDialogClose>
            </div>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
