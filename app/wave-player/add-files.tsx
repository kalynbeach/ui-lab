"use client"

import * as React from "react"
import { FilePlusIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { usePlayerStore } from "@/components/wave-player/context"

export function AddFiles() {
  const store = usePlayerStore("AddFiles")
  const input = React.useRef<HTMLInputElement>(null)
  const [refused, setRefused] = React.useState<readonly string[]>([])

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="secondary"
        data-agent-confirm="Opens a file picker on this device"
        onClick={() => input.current?.click()}
      >
        <FilePlusIcon data-icon="inline-start" aria-hidden="true" />
        Add files
      </Button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(event) => {
          const added = store.addFiles([...(event.currentTarget.files ?? [])])

          setRefused(added.issues.map((issue) => issue.name))
          event.currentTarget.value = ""
        }}
      />
      {refused.length > 0 ? (
        <p role="status" className="type-caption text-muted-foreground">
          {`Skipped files that aren't audio: ${refused.join(", ")}`}
        </p>
      ) : null}
    </div>
  )
}
