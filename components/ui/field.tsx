import * as React from "react"
import {
  Field as FieldPart,
  FieldLabel as FieldLabelPart,
} from "@ui-sdk/react/field"
import { cn } from "cn"

function Field({
  className,
  ...props
}: Omit<React.ComponentProps<typeof FieldPart>, "className"> & {
  className?: string
}) {
  return (
    <FieldPart
      className={cn("flex w-full flex-col gap-2 data-invalid:text-destructive", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: Omit<React.ComponentProps<typeof FieldLabelPart>, "className"> & {
  className?: string
}) {
  return (
    <FieldLabelPart
      className={cn("w-fit type-label data-disabled:opacity-50", className)}
      {...props}
    />
  )
}

export { Field, FieldLabel }
