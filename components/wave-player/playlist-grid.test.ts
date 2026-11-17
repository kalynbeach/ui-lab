import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { describe, expect, test, vi } from "vitest"

import { playlistGrid, type PlaylistItem } from "./playlist-grid"
import { parsePlaylist } from "./playlist"

const TITLES = ["Low tide", "Undertow", "Afterimage", "Night transit"]

const ids = parsePlaylist(
  TITLES.map((title, index) => ({ id: `t${index}`, title, src: `/${index}.mp3` }))
).playlist.tracks.map((track) => track.id)

const ITEMS: readonly PlaylistItem[] = ids.map((value, index) => ({
  value,
  label: TITLES[index],
}))

const markup = (items: readonly PlaylistItem[] = ITEMS) =>
  `<root aria-label="Playlist">${items
    .map(
      ({ value, label }, index) =>
        `<row value="${value}" index="${index}"><track>${String(index + 1).padStart(2, "0")} ${label}</track><play-cell><play label="${label}"></play></play-cell></row>`
    )
    .join("")}</root>`

function setup(options: Omit<Parameters<typeof playlistGrid>[0], "id"> = {}) {
  const onPlay = vi.fn()
  const onSelectedChange = vi.fn()
  const view = mount(
    playlistGrid,
    { items: ITEMS, onPlay, onSelectedChange, ...options },
    markup(options.items ?? ITEMS)
  )
  const track = (index: number) => view.part("track", ids[index])!
  const play = (index: number) => view.part("play", ids[index])!
  const row = (index: number) => view.part("row", ids[index])!
  const focusedTitle = () =>
    TITLES.find((_title, index) => track(index) === document.activeElement)
  const tabbable = () =>
    [...view.root.querySelectorAll<HTMLElement>("[tabindex]")].filter(
      (el) => el.getAttribute("tabindex") === "0"
    )
  return { view, onPlay, onSelectedChange, track, play, row, focusedTitle, tabbable }
}

describe("selecting", () => {
  test("a click selects the row and plays nothing", async () => {
    const { view, onPlay, onSelectedChange, track, row } = setup()
    try {
      await view.click(track(2))
      expect(view.state.selected).toBe(ids[2])
      expect(onSelectedChange).toHaveBeenLastCalledWith(
        ids[2],
        expect.objectContaining({ reason: "item-press", source: "mouse" })
      )
      expect(row(2).getAttribute("aria-selected")).toBe("true")
      expect(row(0).getAttribute("aria-selected")).toBe("false")
      expect(onPlay).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("Enter selects the focused row and plays nothing", async () => {
    const { view, onPlay, onSelectedChange } = setup()
    try {
      await view.keys("Tab", "ArrowDown", "Enter")
      expect(view.state.selected).toBe(ids[1])
      expect(onSelectedChange).toHaveBeenLastCalledWith(
        ids[1],
        expect.objectContaining({ reason: "item-press", source: "keyboard" })
      )
      expect(onPlay).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("Space is left to the player: no select, no play, not prevented", async () => {
    const { view, onPlay, onSelectedChange, track } = setup()
    try {
      await view.keys("Tab")
      const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
      track(0).dispatchEvent(space)
      expect(space.defaultPrevented).toBe(false)
      expect(onSelectedChange).not.toHaveBeenCalled()
      expect(onPlay).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("a controlled selection follows its option", () => {
    const { view, row } = setup({ selected: ids[3] })
    try {
      expect(row(3).hasAttribute("data-selected")).toBe(true)
      expect(row(0).hasAttribute("data-selected")).toBe(false)
    } finally {
      view.unmount()
    }
  })
})

describe("playing", () => {
  test("a row's Play is named for its track and plays it without selecting", async () => {
    const { view, onPlay, onSelectedChange, play } = setup()
    try {
      expect(play(1).getAttribute("aria-label")).toBe("Play Undertow")
      await view.click(play(1))
      expect(onPlay).toHaveBeenCalledExactlyOnceWith(ids[1])
      expect(onSelectedChange).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("Right reaches the row's Play, Enter plays it, Left goes back", async () => {
    const { view, onPlay, track, play } = setup()
    try {
      await view.keys("Tab", "ArrowDown", "ArrowRight")
      expect(document.activeElement).toBe(play(1))
      await view.keys("Enter")
      expect(onPlay).toHaveBeenCalledExactlyOnceWith(ids[1])
      await view.keys("ArrowLeft")
      expect(document.activeElement).toBe(track(1))
    } finally {
      view.unmount()
    }
  })

  test("arrows, Home, and End move between Play buttons", async () => {
    const { view, play } = setup()
    try {
      await view.keys("Tab", "ArrowRight", "ArrowDown")
      expect(document.activeElement).toBe(play(1))
      await view.keys("End")
      expect(document.activeElement).toBe(play(3))
      await view.keys("ArrowUp")
      expect(document.activeElement).toBe(play(2))
      await view.keys("Home")
      expect(document.activeElement).toBe(play(0))
    } finally {
      view.unmount()
    }
  })

  test("Tab back in after a Play button lands on that row", async () => {
    const { view, track, tabbable } = setup()
    try {
      await view.keys("Tab", "ArrowRight", "ArrowDown", "ArrowDown")
      expect(tabbable()).toEqual([track(2)])
    } finally {
      view.unmount()
    }
  })
})

describe("moving focus", () => {
  test("arrows, Home, and End rove without selecting or playing", async () => {
    const { view, onPlay, onSelectedChange, focusedTitle } = setup()
    try {
      await view.keys("Tab")
      expect(focusedTitle()).toBe("Low tide")
      await view.keys("ArrowDown", "ArrowDown")
      expect(focusedTitle()).toBe("Afterimage")
      await view.keys("ArrowUp")
      expect(focusedTitle()).toBe("Undertow")
      await view.keys("End")
      expect(focusedTitle()).toBe("Night transit")
      await view.keys("Home")
      expect(focusedTitle()).toBe("Low tide")
      expect(view.state.selected).toBeNull()
      expect(onSelectedChange).not.toHaveBeenCalled()
      expect(onPlay).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("typing finds a row by its title, not its number", async () => {
    const { view, onSelectedChange, focusedTitle } = setup()
    try {
      await view.keys("Tab")
      await view.type("n")
      expect(focusedTitle()).toBe("Night transit")
      await view.settle()
      await new Promise((resolve) => setTimeout(resolve, 1100))
      await view.type("af")
      expect(focusedTitle()).toBe("Afterimage")
      expect(onSelectedChange).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  test("exactly one cell is tabbable, and it starts on the selected row", async () => {
    const { view, track, tabbable } = setup({ selected: ids[2] })
    try {
      expect(tabbable()).toEqual([track(2)])
      await view.keys("Tab")
      expect(document.activeElement).toBe(track(2))
      await view.keys("ArrowDown")
      expect(tabbable()).toEqual([track(3)])
    } finally {
      view.unmount()
    }
  })
})

describe("current and selected", () => {
  test("are separate attributes", () => {
    const { view, row } = setup({ selected: ids[1], current: ids[2], playing: true })
    try {
      expect(row(1).hasAttribute("data-selected")).toBe(true)
      expect(row(1).hasAttribute("aria-current")).toBe(false)
      expect(row(1).hasAttribute("data-playing")).toBe(false)
      expect(row(2).getAttribute("aria-current")).toBe("true")
      expect(row(2).hasAttribute("data-playing")).toBe(true)
      expect(row(2).getAttribute("aria-selected")).toBe("false")
    } finally {
      view.unmount()
    }
  })

  test("the current row marks playing only while it plays", () => {
    const { view, row } = setup({ current: ids[0], playing: false })
    try {
      expect(row(0).hasAttribute("data-current")).toBe(true)
      expect(row(0).hasAttribute("data-playing")).toBe(false)
    } finally {
      view.unmount()
    }
  })
})

describe("agents", () => {
  const items: readonly PlaylistItem[] = [
    ...ITEMS.slice(0, 2),
    { ...ITEMS[2], hidden: true },
  ]

  test("select and play find a track by title and skip hidden ones", () => {
    const { view, onPlay } = setup({ items })
    try {
      expect(view.api.agentItems()).toEqual([
        { value: ids[0], label: "Low tide" },
        { value: ids[1], label: "Undertow" },
      ])
      expect(view.api.select("Undertow")).toBe(true)
      expect(view.state.selected).toBe(ids[1])
      expect(view.api.play("Low tide")).toBe(true)
      expect(onPlay).toHaveBeenCalledExactlyOnceWith(ids[0])
      expect(view.api.select("Afterimage")).toBe(false)
      expect(view.api.play(ids[2])).toBe(false)
      expect(view.state.selected).toBe(ids[1])
      expect(onPlay).toHaveBeenCalledOnce()
    } finally {
      view.unmount()
    }
  })
})

describe("rendering", () => {
  test("the server renders one tab stop, on the selected row", () => {
    const html = checkServer(playlistGrid, { items: ITEMS, selected: ids[1] }, markup())
    const page = new DOMParser().parseFromString(html, "text/html")
    const stops = page.querySelectorAll('[tabindex="0"]')
    expect(stops).toHaveLength(1)
    expect(stops[0].closest('[role="row"]')?.getAttribute("aria-selected")).toBe("true")
    expect(stops[0].getAttribute("role")).toBe("gridcell")
  })

  test("Left and Right swap in right-to-left text", async () => {
    await checkDirection(playlistGrid, { items: ITEMS }, markup())
  })
})

describe("Space and typing, everywhere in the grid", () => {
  test("Space right after a title search is still left to the player", async () => {
    const { view, focusedTitle, track } = setup()
    try {
      await view.keys("Tab")
      await view.type("a")
      expect(focusedTitle()).toBe("Afterimage")
      const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
      track(TITLES.indexOf("Afterimage")).dispatchEvent(space)
      expect(space.defaultPrevented).toBe(false)
    } finally {
      view.unmount()
    }
  })

  test("typing in the Play column finds the row and stays in that column", async () => {
    const { view, onPlay, onSelectedChange, play } = setup()
    try {
      await view.keys("Tab", "ArrowRight")
      expect(document.activeElement).toBe(play(0))
      await view.type("n")
      expect(document.activeElement).toBe(play(TITLES.indexOf("Night transit")))
      expect(onPlay).not.toHaveBeenCalled()
      expect(onSelectedChange).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })
})

describe("a hidden row that is selected", () => {
  test("shows as selected and takes the tab stop, while the selected value stays empty", () => {
    const items = ITEMS.map((item, index) => (index === 2 ? { ...item, hidden: true, chosen: true } : item))
    const { view, row, track, tabbable } = setup({ items, selected: null })
    try {
      expect(view.state.selected).toBeNull()
      expect(row(2).getAttribute("aria-selected")).toBe("true")
      expect(row(0).getAttribute("aria-selected")).toBe("false")
      expect(tabbable()).toEqual([track(2)])
    } finally {
      view.unmount()
    }
  })
})
