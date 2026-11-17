import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { AddFiles } from "@/app/wave-player/add-files"

import { agent, WavePlayerAgent } from "./agent"
import { WavePlayerCard } from "./card"
import { testPlayer } from "./testing"
import { WavePlayerPlaylist } from "./playlist-view"
import { WavePlayerStore } from "./wave-player"

type Tool = { readonly name: string; readonly execute: (input: object) => unknown }

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
  Reflect.deleteProperty(document, "modelContext")
})

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

// The routes' parts on one page, under the bridge the layout mounts.
async function renderPage() {
  const player = testPlayer()

  render(
    <WavePlayerStore store={player.store}>
      <WavePlayerAgent />
      <WavePlayerCard />
      <WavePlayerPlaylist heading={<h2>Playlist</h2>} />
      <AddFiles />
    </WavePlayerStore>
  )
  await settle()

  return player
}

function mockModelContext(registerTool: (tool: Tool) => unknown) {
  Object.assign(document, { modelContext: { registerTool } })
}

const addFiles = { steps: [{ ref: "Add files", action: "press" }] }

// Starts a step that needs the person, waits for the question, and answers it.
async function answer<Result>(run: () => Promise<Result>, reply: "Allow" | "Don't allow") {
  const result = run()
  const dialog = await screen.findByRole("alertdialog", { name: "Let the agent do this?" })

  expect(dialog.textContent).toContain("Opens a file picker on this device")
  await userEvent.click(screen.getByRole("button", { name: reply }))

  return result
}

test("an agent finds every control a person would name, and none is unnamed", async () => {
  await renderPage()

  const components = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of [
    "Transport",
    "Play",
    "Seek",
    "Shuffle",
    "Repeat",
    "Volume",
    "Playlist",
    "Add files",
  ]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }
  expect(components.find((entry) => entry.label === "Add files")?.confirm).toBe(
    "Opens a file picker on this device"
  )
  expect(components.find((entry) => entry.label === "Playlist")?.items).toEqual([
    { value: "a", label: "Low tide" },
    { value: "b", label: "Undertow" },
    { value: "c", label: "Shoal" },
  ])
})

test("an agent plays, sets Level and Mute, seeks, changes Shuffle and Repeat, and plays a Playlist track by title", async () => {
  const player = await renderPage()
  const state = () => player.store.getSnapshot()

  const started = await agent.act({
    steps: [
      { ref: "Play", action: "setPressed", args: [true] },
      { ref: "Volume", action: "setOpen", args: [true] },
      { ref: "Level", action: "setValue", args: [0.4] },
      { ref: "Mute", action: "setPressed", args: [true] },
      { ref: "Shuffle", action: "setPressed", args: [true] },
      { ref: "Repeat", action: "setValue", args: ["All"] },
    ],
  })
  expect(started.ok, started.error?.message).toBe(true)
  expect(screen.getByRole("button", { name: "Play" }).getAttribute("aria-pressed")).toBe("true")
  expect(state().settings).toMatchObject({ level: 0.4, muted: true, shuffle: true, repeat: "all" })

  const handle = await act(() => player.load())
  const seeked = await agent.act({ steps: [{ ref: "Seek", action: "setValue", args: [45] }] })
  expect(seeked.ok, seeked.error?.message).toBe(true)
  expect(handle.seeks).toEqual([45])

  const playlist = await agent.act({
    steps: [
      { ref: "Playlist", action: "select", args: ["Shoal"] },
      { ref: "Playlist", action: "play", args: ["Undertow"] },
    ],
  })
  expect(playlist.ok, playlist.error?.message).toBe(true)
  expect(state().selected).toBe("b")
  expect(state().current?.track.title).toBe("Undertow")
})

test("Add files waits for the person: refused until they allow it, then it opens the picker once", async () => {
  await renderPage()
  const picker = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})

  const refused = await answer(() => agent.act(addFiles), "Don't allow")
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toMatch(/said no/i)
  expect(picker).not.toHaveBeenCalled()

  const allowed = await answer(() => agent.act(addFiles), "Allow")
  expect(allowed.ok, allowed.error?.message).toBe(true)
  expect(picker).toHaveBeenCalledOnce()
})

test("the agent can't see or answer the question itself", async () => {
  await renderPage()

  const pending = agent.act(addFiles)
  await screen.findByRole("alertdialog")

  const components = agent.snapshot().filter((entry) => !entry.offPage)
  expect(components.filter((entry) => entry.component.includes("dialog"))).toEqual([])
  expect(components.map((entry) => entry.label)).not.toContain("Allow")
  // The bridge queues this behind the open question, so it runs only after the person answers.
  const allow = agent.act({ steps: [{ ref: "Allow", action: "press" }] })

  await userEvent.click(screen.getByRole("button", { name: "Don't allow" }))
  expect((await pending).ok).toBe(false)
  expect((await allow).ok).toBe(false)
})

test("WebMCP gets the three tools, and a marked step asks the person once", async () => {
  const tools = new Map<string, Tool>()
  mockModelContext(async (tool) => {
    tools.set(tool.name, tool)
  })
  await renderPage()

  expect([...tools.keys()].sort()).toEqual(["act", "query", "snapshot"])
  expect(await tools.get("snapshot")!.execute({})).toBeInstanceOf(Array)

  const act = tools.get("act")!
  const refused = (await answer(() => Promise.resolve(act.execute(addFiles)), "Don't allow")) as {
    ok: boolean
  }
  expect(refused.ok).toBe(false)

  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
  const allowed = (await answer(() => Promise.resolve(act.execute(addFiles)), "Allow")) as {
    ok: boolean
  }
  expect(allowed.ok).toBe(true)
  expect(screen.queryByRole("alertdialog")).toBeNull()
})

test.each([
  ["has no WebMCP", null],
  [
    "throws on register",
    () => {
      throw new Error("registerTool failed")
    },
  ],
  [
    "refuses to register",
    () => Promise.reject(new DOMException("Refused", "NotAllowedError")),
  ],
] as const)("a browser that %s still shows a working player", async (_case, registerTool) => {
  if (registerTool) mockModelContext(registerTool)
  const player = await renderPage()

  await userEvent.click(screen.getByRole("button", { name: "Play" }))
  expect(player.store.getSnapshot().status.kind).toBe("loading")
  expect(agent.snapshot().some((entry) => entry.label === "Play")).toBe(true)
})
