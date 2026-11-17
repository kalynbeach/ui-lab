import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { AddFiles } from "@/app/wave-player/add-files"

import { WavePlayerCard } from "./card"
import { WavePlayerFrame } from "./frame"
import { WavePlayerScreen, WavePlayerSettings, WavePlayerTransport } from "./parts"
import { WavePlayerProgress, WavePlayerSeek, WavePlayerTime } from "./seek"
import { TEST_TRACKS, testPlayer } from "./testing"
import { WavePlayerStore } from "./wave-player"

const agent = createAgent()

// jsdom has no IntersectionObserver, matchMedia, or canvas contexts.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function renderCard(
  children: React.ReactNode = <WavePlayerCard />,
  tracks = TEST_TRACKS
) {
  const player = testPlayer(tracks)
  render(<WavePlayerStore store={player.store}>{children}</WavePlayerStore>)
  // Tooltips decide whether they name their trigger after mount.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return player
}

const snapshot = (player: ReturnType<typeof testPlayer>) => player.store.getSnapshot()

const seek = () => screen.getByRole("slider", { name: "Seek" })

test("each control is named and sends its command", async () => {
  const player = await renderCard()
  const user = userEvent.setup()

  expect(screen.getByRole("region", { name: "WavePlayer" })).toBeTruthy()
  expect(screen.getByText("Low tide")).toBeTruthy()
  expect(screen.getByText("Kevelle · Samples")).toBeTruthy()

  await user.click(screen.getByRole("button", { name: "Play" }))
  expect(player.station.openStrip).toHaveBeenCalledOnce()
  expect(snapshot(player).status.kind).toBe("loading")

  await user.click(screen.getByRole("button", { name: "Next track" }))
  expect(snapshot(player).current?.track.title).toBe("Undertow")

  await user.click(screen.getByRole("button", { name: "Previous track" }))
  expect(snapshot(player).current?.track.title).toBe("Low tide")

  await user.click(screen.getByRole("button", { name: "Shuffle" }))
  expect(snapshot(player).settings.shuffle).toBe(true)

  await user.click(screen.getByRole("radio", { name: "One" }))
  expect(snapshot(player).settings.repeat).toBe("one")

  await user.click(screen.getByRole("button", { name: "Remaining time" }))
  expect(snapshot(player).settings.time).toBe("remaining")
  expect(screen.getByRole("button", { name: "Remaining time" }).textContent).toBe("−02:00")

  await user.click(screen.getByRole("button", { name: "Volume" }))
  await user.click(screen.getByRole("button", { name: "Mute" }))
  expect(snapshot(player).settings.muted).toBe(true)

  screen.getByRole("slider", { name: "Level" }).focus()
  await user.keyboard("{ArrowLeft}")
  expect(snapshot(player).settings.level).toBe(0.99)
  expect(snapshot(player).settings.muted).toBe(false)
})

test("the wheel over Level steps the level", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Volume" }))
  const level = screen.getByRole("slider", { name: "Level" })

  fireEvent.wheel(level, { deltaY: 100 })
  expect(snapshot(player).settings.level).toBe(0.95)
  fireEvent.wheel(level, { deltaY: -100 })
  expect(snapshot(player).settings.level).toBe(1)
})

test("the Play toggle keeps its name in every status and says when it is pressed", async () => {
  const player = await renderCard()
  const play = () => screen.getByRole("button", { name: "Play" })

  expect(play().getAttribute("aria-pressed")).toBe("false")

  await userEvent.click(play())
  expect(play().getAttribute("aria-pressed")).toBe("true")

  const handle = await act(() => player.load())
  expect(snapshot(player).status.kind).toBe("playing")
  expect(play().getAttribute("aria-pressed")).toBe("true")

  await userEvent.click(play())
  expect(handle.pause).toHaveBeenCalledOnce()
  act(() => player.strips[0].emit({ kind: "file", name: "a.mp3", duration: null, playback: "paused" }))
  expect(snapshot(player).status.kind).toBe("paused")
  expect(play().getAttribute("aria-pressed")).toBe("false")
})

test("the live region says what plays once, not every status", async () => {
  const player = await renderCard()
  const live = () => document.querySelector("[aria-live=polite]")?.textContent

  expect(live()).toBe("")

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  await act(() => player.load())
  expect(live()).toBe("Now playing Low tide.")

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  expect(live()).toBe("Now playing Low tide.")
  expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
})

test("Space on the Seek thumb toggles playback once, and a button keeps its own Space", async () => {
  const player = await renderCard()
  const user = userEvent.setup()

  seek().focus()
  await user.keyboard(" ")
  expect(snapshot(player).status.kind).toBe("loading")
  expect(player.station.openStrip).toHaveBeenCalledOnce()
  expect(player.strips[0].plays).toHaveLength(1)

  screen.getByRole("button", { name: "Shuffle" }).focus()
  await user.keyboard(" ")
  expect(snapshot(player).settings.shuffle).toBe(true)
  expect(snapshot(player).status.kind).toBe("loading")
})

test("Space on the frame itself toggles playback", async () => {
  const player = await renderCard()

  screen.getByRole("region", { name: "WavePlayer" }).focus()
  await userEvent.keyboard(" ")

  expect(snapshot(player).status.kind).toBe("loading")
})

test("a step key and an agent's value seek at once", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  const handle = await act(() => player.load())

  seek().focus()
  const user = userEvent.setup()
  await user.keyboard("{ArrowRight>}")
  expect(handle.seeks).toEqual([1])
  await user.keyboard("{/ArrowRight}")
  expect(handle.seeks).toEqual([1])

  const result = await agent.act({ steps: [{ ref: "Seek", action: "setValue", args: [30] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(handle.seeks).toEqual([1, 30])
  expect(seek().getAttribute("aria-valuetext")).toBe("0:30 of 2:00")
})

test("a step key moves a whole second from the playhead, even while the thumb sits between seconds", async () => {
  const player = await renderCard(<WavePlayerCard />, [{ id: "s", title: "Short", src: "/s.mp3", duration: 30 }])

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  // At 30 s the seek bar's steps are finer than a second, so the thumb sits off the whole seconds.
  const handle = await act(() => player.load("s.mp3", 30))
  await act(() => player.store.send({ type: "seek", to: 5.6 }))

  seek().focus()
  await userEvent.keyboard("{ArrowLeft}")
  expect(handle.seeks).toEqual([5.6, 4])

  await act(() => player.store.send({ type: "seek", to: 5.6 }))
  await userEvent.keyboard("{ArrowRight}")
  expect(handle.seeks.at(-1)).toBe(6)

  await act(() => player.store.send({ type: "seek", to: 15.6 }))
  await userEvent.keyboard("{PageDown}")
  expect(handle.seeks.at(-1)).toBe(5)
})

/** A drag on the seek bar, 0 to 120 s laid over 0 to 120 px, sent as UI SDK's own test drag sends it. */
function drag() {
  const control = document.querySelector<HTMLElement>("[data-slot=wave-player] [data-slot=slider-control]")!
  const track = control.querySelector<HTMLElement>("[data-slot=slider-track]")!
  const rect = { left: 0, top: 0, right: 120, bottom: 36, width: 120, height: 36, x: 0, y: 0 }

  for (const element of [control, track])
    element.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect })

  const send = (type: string, clientX: number, buttons: number) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY: 18,
      button: type === "pointermove" ? -1 : 0,
      buttons,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    })

    act(() => {
      control.dispatchEvent(event)
    })
  }

  // The slider reads moves once a frame.
  const frame = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

  return {
    down: async (x: number) => {
      send("pointerdown", x, 1)
      await frame()
    },
    move: async (x: number) => {
      send("pointermove", x, 1)
      await frame()
    },
    up: async (x: number) => {
      send("pointerup", x, 0)
      await frame()
    },
    cancel: async () => {
      send("pointercancel", 0, 0)
      await frame()
    },
  }
}

test("a drag previews its target and seeks once on release", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  const handle = await act(() => player.load())
  const pointer = drag()

  await pointer.down(30)
  await pointer.move(60)
  expect(player.store.playhead.position()).toBe(60)
  expect(screen.getByRole("button", { name: "Remaining time" }).textContent).toBe("01:00")
  expect(handle.seeks).toEqual([])

  await pointer.up(60)
  expect(handle.seeks).toEqual([60])
})

test("Escape drops a drag's preview, and its release seeks nothing", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  const handle = await act(() => player.load())
  const pointer = drag()

  await pointer.down(30)
  await pointer.move(60)
  fireEvent.keyDown(window, { key: "Escape" })
  expect(player.store.playhead.position()).toBe(0)

  await pointer.move(90)
  expect(player.store.playhead.position()).toBe(0)
  await pointer.up(90)
  expect(handle.seeks).toEqual([])

  await pointer.down(40)
  await pointer.up(40)
  expect(handle.seeks).toEqual([40])
})

test("a cancelled pointer drops the preview with no seek, and the next drag still seeks", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  const handle = await act(() => player.load())
  const pointer = drag()

  await pointer.down(30)
  await pointer.move(60)
  await pointer.cancel()
  expect(player.store.playhead.position()).toBe(0)
  expect(handle.seeks).toEqual([])

  await pointer.down(20)
  await pointer.move(50)
  await pointer.up(50)
  expect(handle.seeks).toEqual([50])
})

test("an agent can find every control by name, press Play, set Level, and set Seek", async () => {
  const player = await renderCard()

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of ["Transport", "Play", "Seek", "Shuffle", "Repeat", "Volume", "Remaining time"]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }
  expect(components.filter((entry) => entry.component === "tooltip")).toEqual([])
  expect(labels).not.toContain("Level")

  const result = await agent.act({
    steps: [
      { ref: "Play", action: "setPressed", args: [true] },
      { ref: "Transport", action: "press", args: ["Next track"] },
      { ref: "Volume", action: "setOpen", args: [true] },
      { ref: "Level", action: "setValue", args: [0.4] },
      { ref: "Repeat", action: "setValue", args: ["All"] },
      { ref: "Shuffle", action: "setPressed", args: [true] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(snapshot(player).current?.track.title).toBe("Undertow")
  expect(snapshot(player).settings).toMatchObject({ level: 0.4, repeat: "all", shuffle: true })
  expect(player.station.openStrip).toHaveBeenCalledOnce()

  const opened = agent.snapshot().filter((entry) => !entry.offPage).map((entry) => entry.label)
  expect(opened).toContain("Level")
  expect(opened).toContain("Mute")

  const handle = await act(() => player.load("b.mp3"))
  const seeked = await agent.act({ steps: [{ ref: "Seek", action: "setValue", args: [45] }] })
  expect(seeked.ok, seeked.error?.message).toBe(true)
  expect(handle.seeks).toEqual([45])
})

test("the letter keys send their commands while the player holds focus", async () => {
  const player = await renderCard()
  const user = userEvent.setup()

  screen.getByRole("region", { name: "WavePlayer" }).focus()
  await user.keyboard("smrt")
  expect(snapshot(player).settings).toMatchObject({
    shuffle: true,
    muted: true,
    repeat: "all",
    time: "remaining",
  })

  await user.keyboard("n")
  expect(snapshot(player).current?.track.title).not.toBe("Low tide")
})

test("a failed track shows the fault, unknown times, a disabled Seek, and what Play does", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  act(() =>
    player.strips[0].emit({ kind: "failed", source: "file", error: { kind: "unknown", message: "404" } })
  )

  expect(snapshot(player).status).toEqual({ kind: "failed", reason: "load" })
  expect(screen.getByText("FAULT")).toBeTruthy()
  expect(screen.getByText("Couldn't load the track")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Remaining time" }).textContent).toBe("--:--")
  expect(seek().hasAttribute("disabled") || seek().getAttribute("aria-disabled") === "true").toBe(true)

  const play = screen.getByRole("button", { name: "Play" })
  expect(play.getAttribute("aria-pressed")).toBe("false")
  expect(document.getElementById(play.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Tries again.")
  expect(document.querySelector("[aria-live=polite]")?.textContent).toBe("Couldn't load Low tide.")
})

test("two frames on one store share the keys without a warning", async () => {
  const player = await renderCard(
    <>
      <WavePlayerCard />
      <WavePlayerFrame kind="mini">
        <WavePlayerScreen className="size-18" />
        <WavePlayerTransport size="sm" />
      </WavePlayerFrame>
    </>
  )

  screen.getAllByRole("region", { name: "WavePlayer" })[1].focus()
  await userEvent.keyboard("s")
  expect(snapshot(player).settings.shuffle).toBe(true)
  expect(screen.getAllByRole("region", { name: "WavePlayer" })).toHaveLength(2)
})

test("the small variants' parts: the line seek, the progress, and the Settings popup", async () => {
  const player = await renderCard(
    <WavePlayerFrame kind="bar">
      <WavePlayerSeek appearance="line" />
      <WavePlayerProgress />
      <WavePlayerTime />
      <WavePlayerSettings />
    </WavePlayerFrame>
  )
  const user = userEvent.setup()

  expect(screen.getByRole("progressbar", { name: "Progress" }).getAttribute("aria-valuetext")).toBe("0:00 of 2:00")

  await user.click(screen.getByRole("button", { name: "Settings" }))
  await user.click(screen.getByRole("button", { name: "Shuffle" }))
  await user.click(screen.getByRole("radio", { name: "All" }))
  await user.click(screen.getByRole("button", { name: "Mute" }))
  expect(snapshot(player).settings).toMatchObject({ shuffle: true, repeat: "all", muted: true })

  await user.keyboard("{Escape}")
  act(() => player.store.send({ type: "toggle" }))
  const handle = await act(() => player.load())

  seek().focus()
  await user.keyboard("{End}")
  expect(handle.seeks).toEqual([120])
  expect(screen.getByRole("progressbar", { name: "Progress" }).getAttribute("aria-valuetext")).toBe("2:00 of 2:00")
})

test("an agent can't add files without a person", async () => {
  await renderCard(<AddFiles />)

  const result = await agent.act({ steps: [{ ref: "Add files", action: "press" }] })
  expect(result.ok).toBe(false)
  expect(result.error?.message).toMatch(/person/i)
})

test("a drag that outlives its track's source seeks nothing", async () => {
  const player = await renderCard()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  await act(() => player.load())

  const pointer = drag()

  await pointer.down(30)
  act(() =>
    player.store.setTracks(
      TEST_TRACKS.map((track) => (track.id === "a" ? { ...track, src: "/replacement.mp3" } : track))
    )
  )
  expect(player.store.playhead.position()).toBe(0)

  await pointer.move(60)
  await pointer.up(60)

  expect(player.store.playhead.position()).toBe(0)
  expect(player.store.playhead.scrubbing()).toBe(false)
})

test("Space during text composition starts nothing", async () => {
  const player = await renderCard()
  const frame = screen.getByRole("region", { name: "WavePlayer" })

  frame.focus()
  fireEvent.keyDown(frame, { key: " ", code: "Space", isComposing: true })

  expect(player.station.openStrip).not.toHaveBeenCalled()
})

test("a letter typed outside the player leaves it alone", async () => {
  const player = await renderCard(
    <>
      <WavePlayerCard />
      <button type="button">Other control</button>
    </>
  )

  screen.getByRole("button", { name: "Other control" }).focus()
  await userEvent.keyboard("n")
  expect(snapshot(player).current?.track.id).toBe("a")

  document.body.focus()
  await userEvent.keyboard("n")
  expect(snapshot(player).current?.track.id).toBe("a")
})

test("with page keys, a letter works from anywhere outside a player", async () => {
  const player = testPlayer()

  render(
    <WavePlayerStore store={player.store} keys="page">
      <WavePlayerCard />
      <button type="button">Other control</button>
    </WavePlayerStore>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  await userEvent.keyboard("n")
  expect(snapshot(player).current?.track.id).toBe("b")

  screen.getByRole("button", { name: "Other control" }).focus()
  await userEvent.keyboard("p")
  expect(snapshot(player).current?.track.id).toBe("a")
})

test("focus chooses which of two players takes a letter", async () => {
  const first = testPlayer()
  const second = testPlayer()

  render(
    <>
      <WavePlayerStore store={first.store}>
        <WavePlayerCard />
      </WavePlayerStore>
      <WavePlayerStore store={second.store}>
        <WavePlayerCard />
      </WavePlayerStore>
    </>
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  screen.getAllByRole("region", { name: "WavePlayer" })[0].focus()
  await userEvent.keyboard("s")

  expect(snapshot(first).settings.shuffle).toBe(true)
  expect(snapshot(second).settings.shuffle).toBe(false)
})
