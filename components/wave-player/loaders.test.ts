import { afterEach, describe, expect, test, vi } from "vitest"

import { probeDuration } from "./loaders"

// jsdom has no object URLs.
function objectUrls(create: (file: Blob) => string, revoke: (url: string) => void) {
  return class extends URL {
    static createObjectURL = create
    static revokeObjectURL = revoke
  }
}

describe("probeDuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("reads a File through an object URL and revokes it when the probe ends", async () => {
    const create = vi.fn(() => "blob:probe")
    const revoke = vi.fn()

    vi.stubGlobal("URL", objectUrls(create, revoke))
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})

    const file = new File(["x"], "one.mp3", { type: "audio/mpeg" })
    const controller = new AbortController()
    const probe = probeDuration(file, controller.signal)

    expect(create).toHaveBeenCalledWith(file)
    expect(revoke).not.toHaveBeenCalled()

    controller.abort()

    await expect(probe).resolves.toBeNull()
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:probe")
  })

  test("makes no object URL for a site track", async () => {
    const create = vi.fn(() => "blob:probe")

    vi.stubGlobal("URL", objectUrls(create, vi.fn()))
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})

    const controller = new AbortController()
    const probe = probeDuration(new URL("https://site.test/a.mp3"), controller.signal)

    controller.abort()

    await expect(probe).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
