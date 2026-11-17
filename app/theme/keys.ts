// Kevelle's key recipes. Each state is written twice, as the real variant and
// as a data-preview variant, so the theme page can hold a key in that state.
// A held press is also hovered, so the pressed preview takes the hover fill.

const key =
  "inline-flex h-8 items-center justify-center gap-1.5 border px-2.5 text-sm font-medium whitespace-nowrap alloy-raised transition-all select-none focus-visible:outline-hidden data-[preview=focus]:outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[preview=pressed]:[--tw-inset-shadow:var(--alloy-shade),var(--alloy-sill)] data-[preview=pressed]:[--tw-shadow:0_0_#0000] data-[preview=focus]:border-ring data-[preview=focus]:ring-2 data-[preview=focus]:ring-ring"

const button = `${key} active:not-aria-[haspopup]:translate-y-px data-[preview=pressed]:translate-y-px`

const buttonKeys = {
  Primary: `${button} border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover [&:is([data-preview=hover],[data-preview=pressed])]:border-primary-hover [&:is([data-preview=hover],[data-preview=pressed])]:bg-primary-hover`,
  Secondary: `${button} border-border bg-secondary text-secondary-foreground hover:border-input hover:alloy-lit [&:is([data-preview=hover],[data-preview=pressed])]:border-input [&:is([data-preview=hover],[data-preview=pressed])]:alloy-lit`,
  Outline: `${button} border-border bg-background text-foreground hover:border-input hover:alloy-lit [&:is([data-preview=hover],[data-preview=pressed])]:border-input [&:is([data-preview=hover],[data-preview=pressed])]:alloy-lit`,
  Destructive: `${button} border-destructive bg-destructive text-destructive-foreground hover:border-destructive-hover hover:bg-destructive-hover focus-visible:border-destructive focus-visible:ring-destructive/30 [&:is([data-preview=hover],[data-preview=pressed])]:border-destructive-hover [&:is([data-preview=hover],[data-preview=pressed])]:bg-destructive-hover data-[preview=focus]:border-destructive data-[preview=focus]:ring-destructive/30`,
}

const toggleKey = `${key} min-w-8 border-border bg-secondary text-secondary-foreground not-aria-pressed:hover:border-input not-aria-pressed:hover:alloy-lit not-aria-pressed:[&:is([data-preview=hover],[data-preview=pressed])]:border-input not-aria-pressed:[&:is([data-preview=hover],[data-preview=pressed])]:alloy-lit aria-pressed:alloy-selected`

const previews = ["rest", "hover", "pressed", "focus", "disabled"] as const

export { buttonKeys, previews, toggleKey }
