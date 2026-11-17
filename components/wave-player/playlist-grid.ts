import {
  createChange,
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
}

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
      preferred: (cell) => cell.key === context.store.get().selected,
      claims: (state, cell) =>
        !state.items.some((item) => item.value === state.selected) ||
        cell.key === state.selected,
    })
    const typeahead = createTypeahead()
    const plays = new Map<string, HTMLElement>()

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
        if (event.key === " " && typeahead.active()) event.preventDefault()
        if (!isTypeaheadKey(event)) return
        const cells = roving.items()
        const index = typeahead(
          event.key,
          cells.map((cell) => byKey(cell.key)?.label ?? ""),
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
        const move = PLAY_MOVES[event.key]
        if (!move) return
        event.preventDefault()
        const keys = roving.items().map((cell) => cell.key)
        const to = keys[move(keys.indexOf(key), keys.length - 1)]
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
    row: slot<{ value: string }>({
      props: { value: "string" },
      role: "row",
      attrs: (state, part) => {
        const selected = state.selected === part.key
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
    track: slot<{ value?: string }>({
      props: { value: { kind: "string", from: "row", required: true } },
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
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    "play-cell": slot<{ value?: string }>({
      props: { value: { kind: "string", from: "row", required: true } },
      role: "gridcell",
      focus: { none: "The Play button inside it takes focus." },
    }),
    play: slot<{ value?: string; label?: string }>({
      props: {
        value: { kind: "string", from: "row", required: true },
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
      bind: (el, part) => part.api.bindPlay(el, part.key),
    }),
  }),
  agent: {
    actions: ["select", "play"],
    items: (api) => api.agentItems(),
  },
})
