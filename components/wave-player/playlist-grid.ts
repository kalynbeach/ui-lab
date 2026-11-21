import {
  createChange,
  createFocusRecovery,
  createRovingFocus,
  createTypeahead,
  definePrimitive,
  isRTL,
  isTypeaheadKey,
  type ChangeDetails,
} from "@ui-sdk/core"

import type { TrackId } from "./playlist"

export type PlaylistItem = {
  readonly value: TrackId
  readonly label: string
  // A person's own file. Agents never see or reach it. data-agent-hidden on
  // its row would hide the whole Playlist from agents, not the one row.
  readonly hidden?: boolean
  // A hidden row that is selected. Agents read `selected`, so the host passes
  // null there for a hidden row and marks the row here instead.
  readonly chosen?: boolean
}

type Chosen = {
  readonly selected: TrackId | null
  readonly items: readonly PlaylistItem[]
}

const chosenOf = (state: Chosen) =>
  state.selected ?? state.items.find((item) => item.chosen)?.value ?? null

export type PlaylistSelectReason = "item-press" | "imperative"

type PlaylistOptions = {
  items?: readonly PlaylistItem[]
  selected?: TrackId | null
  defaultSelected?: TrackId | null
  current?: TrackId | null
  playing?: boolean
  onSelectedChange?: (
    value: TrackId | null,
    details: ChangeDetails<PlaylistSelectReason>
  ) => void
  onPlay?: (value: TrackId) => void
}

const PLAY_MOVES: Record<string, (index: number, last: number) => number> = {
  ArrowUp: (index) => Math.max(0, index - 1),
  ArrowDown: (index, last) => Math.min(last, index + 1),
  Home: () => 0,
  End: (_index, last) => last,
}

// Selecting never plays, and Space is left to the player around the grid.
export const playlistGrid = definePrimitive({
  name: "playlist",
  options: {
    items: "list",
    selected: "value",
    defaultSelected: "value",
    current: "value",
    playing: "boolean",
    onSelectedChange: "callback",
    onPlay: "callback",
  },
  controlled: ["selected"],
  state: (options: PlaylistOptions) => ({
    items: options.items ?? [],
    selected: options.selected ?? options.defaultSelected ?? null,
    current: options.current ?? null,
    playing: options.playing ?? false,
    focused: null as string | null,
  }),
  sync: (options) => ({
    items: options.items ?? [],
    current: options.current ?? null,
    playing: options.playing ?? false,
    ...(options.selected === undefined ? {} : { selected: options.selected }),
  }),
  api: (context) => {
    const change = createChange(context)
    const items = () => context.store.get().items
    const roving = createRovingFocus(context, {
      slot: "track",
      key: "focused",
      preferred: (cell) => cell.key === chosenOf(context.store.get()),
      claims: (state, cell) => {
        const chosen = chosenOf(state)

        return !state.items.some((item) => item.value === chosen) || cell.key === chosen
      },
    })
    const typeahead = createTypeahead()
    const plays = new Map<string, HTMLElement>()
    // The row that takes a removed row's place, or the last row when the end left.
    const successor = (index: number | undefined) => {
      const cells = roving.items()

      return cells[index ?? 0] ?? cells.at(-1)
    }
    const trackRecovery = createFocusRecovery<{ index?: number }>({
      fallback: (lost) => successor(lost.props.index)?.el,
    })
    const playRecovery = createFocusRecovery<{ index?: number }>({
      fallback: (lost) => {
        const cell = successor(lost.props.index)

        return cell && (plays.get(cell.key) ?? cell.el)
      },
    })
    const labels = () => roving.items().map((cell) => byKey(cell.key)?.label ?? "")

    const byKey = (key: string) => items().find((item) => item.value === key)
    const byName = (name: string) =>
      items().find(
        (item) => !item.hidden && (item.value === name || item.label === name)
      )

    const choose = (item: PlaylistItem | undefined, event?: Event) =>
      item !== undefined &&
      change(
        "selected",
        item.value,
        event instanceof MouseEvent || event instanceof KeyboardEvent
          ? { reason: "item-press", event }
          : { reason: "imperative" }
      )

    const start = (item: PlaylistItem | undefined) => {
      if (item === undefined) return false
      context.options().onPlay?.(item.value)
      return true
    }

    return {
      roving,
      trackRecovery,
      playRecovery,
      agentItems: () =>
        items()
          .filter((item) => !item.hidden)
          .map(({ value, label }) => ({ value, label })),
      select: (name: string) => choose(byName(name)),
      play: (name: string) => start(byName(name)),
      press: (key: string, event?: Event) =>
        choose(byKey(key), event),
      playRow: (key: string) => start(byKey(key)),
      bindPlay(el: HTMLElement, key: string) {
        plays.set(key, el)
        return () => {
          if (plays.get(key) === el) plays.delete(key)
        }
      },
      trackKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.defaultPrevented) return
        if (event.key === (isRTL(el) ? "ArrowLeft" : "ArrowRight")) {
          const play = plays.get(key)
          if (play) {
            event.preventDefault()
            play.focus()
          }
          return
        }
        if (roving.keydown(event, el)) return
        if (event.key === "Enter") {
          event.preventDefault()
          choose(byKey(key), event)
          return
        }
        // Space belongs to the player around the grid, even mid search.
        if (event.key === " " || !isTypeaheadKey(event)) return
        const cells = roving.items()
        const index = typeahead(
          event.key,
          labels(),
          cells.findIndex((cell) => cell.el === el)
        )
        if (index !== -1) roving.focus(cells[index].key)
      },
      playKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.defaultPrevented) return
        if (event.key === (isRTL(el) ? "ArrowRight" : "ArrowLeft")) {
          event.preventDefault()
          roving.focus(key)
          return
        }
        const keys = roving.items().map((cell) => cell.key)
        const move = PLAY_MOVES[event.key]
        let to: string | undefined
        if (move) {
          event.preventDefault()
          to = keys[move(keys.indexOf(key), keys.length - 1)]
        } else if (event.key !== " " && isTypeaheadKey(event)) {
          to = keys[typeahead(event.key, labels(), keys.indexOf(key))]
        }
        if (to === undefined) return
        // The row's track cell keeps the tab stop, so Tab back in lands on this row.
        roving.remember(to)
        plays.get(to)?.focus()
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each track cell and Play button handles its own keys." },
    }),
    row: slot<{ value: string; index?: number }>({
      props: { value: "string", index: "number" },
      role: "row",
      attrs: (state, part) => {
        const selected = chosenOf(state) === part.key
        const current = state.current === part.key
        return {
          "aria-selected": String(selected),
          "aria-current": current ? "true" : undefined,
          "data-selected": selected ? "" : undefined,
          "data-current": current ? "" : undefined,
          "data-playing": current && state.playing ? "" : undefined,
        }
      },
    }),
    track: slot<{ value?: string; index?: number }>({
      props: {
        value: { kind: "string", from: "row", required: true },
        index: { kind: "number", from: "row" },
      },
      role: "gridcell",
      focus: "roving",
      keys: [
        "ArrowUp",
        "ArrowDown",
        "ArrowRight",
        "ArrowLeft",
        "Home",
        "End",
        "Enter",
        "typeahead",
      ],
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      press: ({ api, key }, event) => {
        api.press(key, event)
      },
      on: {
        keydown: (event, { el, api, key }) => {
          if (el) api.trackKeydown(event, el, key)
        },
      },
      bind: (el, part) => {
        const unbindFocus = part.api.roving.bind(el, part)
        const unbindRecovery = part.api.trackRecovery.bind(el, part)

        return () => {
          unbindFocus()
          unbindRecovery()
        }
      },
    }),
    "play-cell": slot<{ value?: string }>({
      props: { value: { kind: "string", from: "row", required: true } },
      role: "gridcell",
      focus: { none: "The Play button inside it takes focus." },
    }),
    play: slot<{ value?: string; index?: number; label?: string }>({
      props: {
        value: { kind: "string", from: "row", required: true },
        index: { kind: "number", from: "row" },
        label: "string",
      },
      role: "button",
      focus: "native",
      attrs: (_state, part) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Play ${part.props.label ?? part.key}`,
      }),
      press: ({ api, key }) => {
        api.playRow(key)
      },
      on: {
        keydown: (event, { el, api, key }) => {
          if (el) api.playKeydown(event, el, key)
        },
      },
      bind: (el, part) => {
        const unbindPlay = part.api.bindPlay(el, part.key)
        const unbindRecovery = part.api.playRecovery.bind(el, part)

        return () => {
          unbindPlay()
          unbindRecovery()
        }
      },
    }),
  }),
  agent: {
    actions: ["select", "play"],
    items: (api) => api.agentItems(),
  },
})
