// Kevelle's key recipes. Each state is written twice, as the real variant and
// as a data-preview variant, so the theme page can hold a key in that state.
// A held press is also hovered, so the pressed preview takes the hover fill.
// Tailwind reads classes from source text, so every class is written out whole.

const key =
  "inline-flex h-8 items-center justify-center gap-1.5 border px-2.5 text-sm font-medium whitespace-nowrap select-none focus-visible:outline-hidden data-[preview=focus]:outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:aura-focus disabled:pointer-events-none disabled:opacity-50 data-[preview=focus]:border-ring data-[preview=focus]:ring-2 data-[preview=focus]:ring-ring data-[preview=focus]:aura-focus"

const raised =
  "alloy-raised data-[preview=pressed]:[--tw-inset-shadow:var(--alloy-shade),var(--alloy-sill)] data-[preview=pressed]:[--tw-shadow:0_0_#0000]"

const button = `${key} transition-[color,background-color,translate] active:not-aria-[haspopup]:translate-y-px data-[preview=pressed]:translate-y-px`

// Primary and destructive draw their 1px frame from the fill, so it fades with it.
// The others clip the fill to the padding box, inside their edge.
const buttonKeys = {
  Primary: `${button} ${raised} border-transparent bg-primary bg-clip-border bg-no-repeat bg-origin-padding text-primary-foreground hover:bg-primary-hover [&:is([data-preview=hover],[data-preview=pressed])]:bg-primary-hover`,
  Secondary: `${button} ${raised} border-border bg-secondary bg-clip-padding text-secondary-foreground hover:alloy-hover [&:is([data-preview=hover],[data-preview=pressed])]:alloy-hover`,
  Outline: `${button} ${raised} border-border bg-background bg-clip-padding text-foreground hover:alloy-hover [&:is([data-preview=hover],[data-preview=pressed])]:alloy-hover`,
  Ghost: `${button} border-transparent bg-clip-padding text-foreground hover:alloy-ghost [&:is([data-preview=hover],[data-preview=pressed])]:alloy-ghost data-[preview=pressed]:[--tw-inset-shadow:var(--alloy-shade),var(--alloy-sill)]`,
  Destructive: `${button} ${raised} border-transparent bg-destructive bg-clip-border bg-no-repeat bg-origin-padding text-destructive-foreground hover:bg-destructive-hover [&:is([data-preview=hover],[data-preview=pressed])]:bg-destructive-hover`,
}

const toggleKey = `${key} ${raised} min-w-8 border-border bg-secondary bg-clip-padding text-secondary-foreground transition-[color,background-color] not-aria-pressed:hover:alloy-hover not-aria-pressed:[&:is([data-preview=hover],[data-preview=pressed])]:alloy-hover aria-pressed:alloy-selected`

const previews = ["rest", "hover", "pressed", "focus", "disabled"] as const

export { buttonKeys, previews, toggleKey }
