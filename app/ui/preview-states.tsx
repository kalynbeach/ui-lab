"use client"

import * as React from "react"

// Holds a part in a state a person reaches by pointer or keyboard. Each
// same-origin rule that keys on one of these states is copied with the state
// swapped for data-preview, so a cell marked data-preview="hover active"
// paints as hovered and pressed. The parts themselves carry no preview hooks.
// The lookbehind skips escaped colons inside class names, like hover\:bg-muted.
const swaps: [RegExp, string][] = [
  [/(?<!\\):has\(:focus-visible\)/g, '[data-preview~="focus"]'],
  [/(?<!\\):focus-visible/g, '[data-preview~="focus"]'],
  [/(?<!\\):hover/g, '[data-preview~="hover"]'],
  [/(?<!\\):active/g, '[data-preview~="active"]'],
  [/\[data-dragging\]/g, '[data-preview~="drag"]'],
]

const stateful =
  /(?<!\\):has\(:focus-visible\)|(?<!\\):focus-visible|(?<!\\):hover|(?<!\\):active|\[data-dragging\]/

function resolve(selector: string, parent: string | null) {
  if (parent === null) return selector
  const scoped = `:is(${parent})`
  return selector.includes("&")
    ? selector.replaceAll("&", scoped)
    : `${scoped} ${selector}`
}

function hold(selector: string, declarations: string, out: string[]) {
  if (!declarations || !stateful.test(selector)) return
  let held = selector
  for (const [pattern, attribute] of swaps) held = held.replace(pattern, attribute)
  out.push(`${held} { ${declarations} }`)
}

function copy(rules: CSSRuleList, parent: string | null, out: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selector = resolve(rule.selectorText, parent)
      hold(selector, rule.style.cssText, out)
      copy(rule.cssRules, selector, out)
    } else if (typeof CSSNestedDeclarations !== "undefined" && rule instanceof CSSNestedDeclarations) {
      // Declarations nested under an at-rule, such as hover: inside (hover: hover).
      if (parent !== null) hold(parent, rule.style.cssText, out)
    } else if (rule instanceof CSSMediaRule) {
      const inner: string[] = []
      copy(rule.cssRules, parent, inner)
      if (inner.length === 0) continue
      // Hover rules sit under (hover: hover); a held cell shows them anywhere.
      if (/^\(hover:\s*hover\)$/.test(rule.conditionText)) out.push(...inner)
      else out.push(`@media ${rule.conditionText} { ${inner.join("\n")} }`)
    } else if (rule instanceof CSSSupportsRule || rule instanceof CSSLayerBlockRule) {
      copy(rule.cssRules, parent, out)
    }
  }
}

function PreviewStates() {
  React.useEffect(() => {
    const out: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      copy(rules, null, out)
    }
    const style = document.createElement("style")
    style.dataset.previewStates = ""
    style.textContent = `@layer utilities { ${out.join("\n")} }`
    document.head.append(style)
    return () => style.remove()
  }, [])

  return null
}

export { PreviewStates }
