import { describe, expect, test } from "vitest"

import { toSeconds } from "@/lib/audio/index"

import {
  initialIntent,
  peekNext,
  planCommand,
  planEnded,
  reconcilePlaylist,
  reseedIntent,
  type Intent,
  type PlayerCommand,
  type Plan,
} from "./model"
import { parsePlaylist, type Playlist, type WavePlayerTrack } from "./playlist"
import { currentOf } from "./queue"
import type { Repeat } from "./settings"

function list(...ids: string[]): Playlist {
  return parsePlaylist(
    ids.map((id): WavePlayerTrack => ({ id, title: id.toUpperCase(), src: `/${id}.mp3` }))
  ).playlist
}

const ABC = list("a", "b", "c")

/** A player on `playlist`, walked through `commands` the way the store does: each plan's intent becomes the next one's. */
function player(playlist: Playlist, seed = 7) {
  let intent: Intent = reseedIntent(initialIntent(playlist), seed)

  const situation = (position = 0) => ({
    playlist,
    intent,
    status: "playing" as const,
    position,
    duration: toSeconds(200),
    loaded: true,
    retry: true,
  })

  const take = (plan: Plan) => {
    intent = plan.intent

    return plan
  }

  return {
    intent: () => intent,
    current: () => currentOf(intent.queue),
    peek: () => peekNext(playlist, intent),
    send: (command: PlayerCommand, position = 0) => take(planCommand(command, situation(position))),
    ended: () => take(planEnded({ playlist, intent })),
    /** Next until it does nothing, at most `limit` times. The ids it played, in order. */
    walk(limit = 20) {
      const played: string[] = []

      for (let step = 0; step < limit; step += 1) {
        if (this.send({ type: "next" }).effect.kind === "none") break

        played.push(this.current()!)
      }

      return played
    },
    replace(next: Playlist) {
      intent = reconcilePlaylist(intent, playlist, next)
      playlist = next
    },
  }
}

function setUp(playlist: Playlist, repeat: Repeat, shuffle: boolean, seed = 7) {
  const p = player(playlist, seed)

  p.send({ type: "set-repeat", repeat })
  p.send({ type: "set-shuffle", shuffle })

  return p
}

describe("history", () => {
  test("Previous walks back through what actually played, even after a direct play repeats a track under shuffle", () => {
    const p = setUp(ABC, "off", true)

    p.send({ type: "toggle" })
    p.send({ type: "play-track", id: "b" })
    p.send({ type: "play-track", id: "c" })
    p.send({ type: "play-track", id: "a" })

    const back = [1, 2, 3].map(() => {
      p.send({ type: "previous" })

      return p.current()
    })

    expect(back).toEqual(["c", "b", "a"])
    expect(p.send({ type: "previous" }).effect).toEqual({ kind: "restart" })
    expect(p.current()).toBe("a")
  })

  test("Next retraces the tracks Previous stepped back over, before the Playlist order", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })

    expect(p.current()).toBe("a")
    expect(p.walk()).toEqual(["c"])
  })

  test("a direct play ends the retrace and starts a round after the played track", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })
    p.send({ type: "previous" })
    p.send({ type: "play-track", id: "b" })

    expect(p.walk()).toEqual(["c"])
  })

  test("Previous past 3 s restarts and keeps the history", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })

    expect(p.send({ type: "previous" }, 3.5).effect).toEqual({ kind: "restart" })
    expect(p.current()).toBe("b")
    p.send({ type: "previous" }, 0)
    expect(p.current()).toBe("a")
  })
})

describe("repeat", () => {
  test.each<[Repeat, string[]]>([
    ["off", ["b", "c"]],
    ["one", ["b", "c"]],
  ])("Next stops after the last track with repeat %s", (repeat, played) => {
    expect(setUp(ABC, repeat, false).walk()).toEqual(played)
  })

  test("Next under repeat all wraps to the first track and keeps going", () => {
    expect(setUp(ABC, "all", false).walk(5)).toEqual(["b", "c", "a", "b", "c"])
  })

  test("a manual Next under repeat one still advances", () => {
    const p = setUp(ABC, "one", false)

    expect(p.send({ type: "next" }).effect).toEqual({ kind: "load" })
    expect(p.current()).toBe("b")
  })

  test("the end of a track under repeat one restarts it, under every shuffle", () => {
    for (const shuffle of [false, true]) {
      const p = setUp(ABC, "one", shuffle)
      const before = p.intent()

      expect(p.ended()).toEqual({ intent: before, effect: { kind: "restart" } })
    }
  })

  test.each<[Repeat, string | null]>([
    ["off", null],
    ["all", "a"],
  ])("the end of the last track with repeat %s plays %s", (repeat, next) => {
    const p = setUp(ABC, repeat, false)

    p.send({ type: "play-track", id: "c" })

    const plan = p.ended()

    expect(plan.effect).toEqual(next ? { kind: "load" } : { kind: "none" })
    expect(p.current()).toBe(next ?? "c")
  })

  test("the end of a track with a following one plays it, repeat off or all", () => {
    for (const repeat of ["off", "all"] as const) {
      const p = setUp(ABC, repeat, false)

      expect(p.ended().effect).toEqual({ kind: "load" })
      expect(p.current()).toBe("b")
    }
  })

  test("repeat all on one track restarts it, for Next and for the end", () => {
    const p = setUp(list("solo"), "all", true)

    expect(p.peek()).toBe("solo")
    expect(p.send({ type: "next" }).effect).toEqual({ kind: "restart" })
    expect(p.ended().effect).toEqual({ kind: "restart" })
    expect(p.current()).toBe("solo")
  })
})

describe("shuffle", () => {
  const TEN = list(..."abcdefghij")

  test("a round plays every other track once, then stops with repeat off", () => {
    const played = setUp(TEN, "off", true).walk()

    expect(played).toHaveLength(9)
    expect(new Set(played)).toEqual(new Set("bcdefghij"))
  })

  test("the seed decides the order, so one seed repeats it and another changes it", () => {
    const one = setUp(TEN, "off", true, 1).walk()

    expect(setUp(TEN, "off", true, 1).walk()).toEqual(one)
    expect(setUp(TEN, "off", true, 2).walk()).not.toEqual(one)
  })

  test("a new round under repeat all holds every track", () => {
    const p = setUp(TEN, "all", true)

    p.walk(9)

    expect(new Set(p.walk(10))).toEqual(new Set("abcdefghij"))
  })

  test("a new round under repeat all never starts with the track that just played, whatever the seed", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const p = setUp(ABC, "all", true, seed)
      const played = p.walk(9)

      for (const end of [1, 4, 7]) expect(played[end + 1]).not.toBe(played[end])
    }
  })

  test("Previous to a track still in the round takes it out of the round", () => {
    const p = setUp(list("a", "b", "c", "d"), "off", true)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })

    const played = p.walk()

    expect(played[0]).toBe("c")
    expect(played.filter((id) => id === "a")).toEqual([])
    expect(new Set(played)).toEqual(new Set("bcd"))
  })

  test("turning shuffle on keeps the current track and what played before", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.send({ type: "set-shuffle", shuffle: true })

    expect(p.current()).toBe("b")
    p.send({ type: "previous" })
    expect(p.current()).toBe("a")
  })

  test("turning shuffle on makes a round of every other track, not only the ones after current", () => {
    const p = player(TEN)

    p.send({ type: "play-track", id: "h" })
    p.send({ type: "set-shuffle", shuffle: true })

    expect(new Set(p.walk())).toEqual(new Set("abcdefgij"))
  })

  test("changing shuffle ends the retrace, and turning it off returns to the Playlist order after current", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })
    p.send({ type: "set-shuffle", shuffle: true })
    p.send({ type: "set-shuffle", shuffle: false })

    expect(p.current()).toBe("a")
    expect(p.walk()).toEqual(["b", "c"])
  })
})

describe("peekNext", () => {
  const MODES = [
    ["off", false],
    ["all", false],
    ["one", false],
    ["off", true],
    ["all", true],
    ["one", true],
  ] as const

  test.each(MODES)("names the track Next then plays, step by step, with repeat %s and shuffle %s", (repeat, shuffle) => {
    const p = setUp(list(..."abcde"), repeat, shuffle)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })

    for (let step = 0; step < 12; step += 1) {
      const peeked = p.peek()

      expect(p.peek()).toBe(peeked)

      const plan = p.send({ type: "next" })

      if (peeked === null) {
        expect(plan.effect).toEqual({ kind: "none" })
        break
      }

      expect(p.current()).toBe(peeked)
    }
  })

  test("is null with no tracks", () => {
    expect(player(list()).peek()).toBeNull()
  })
})

describe("playlist updates", () => {
  test("a site track inserted before the current one is not in the rest of the round, unshuffled", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.replace(list("a", "x", "b", "c"))

    expect(p.current()).toBe("b")
    expect(p.walk()).toEqual(["c"])
  })

  test("a reorder, unshuffled, makes the rest of the round follow the new order after current", () => {
    const p = player(list("a", "b", "c", "d"))

    p.replace(list("a", "d", "c", "b"))

    expect(p.walk()).toEqual(["d", "c", "b"])
  })

  test("a removed current track makes the first track current, with no history", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.replace(list("a", "c"))

    expect(p.current()).toBe("a")
    expect(p.send({ type: "previous" }).effect).toEqual({ kind: "restart" })
  })

  test("a removed track leaves the history", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.send({ type: "play-track", id: "c" })
    p.replace(list("a", "c"))
    p.send({ type: "previous" })

    expect(p.current()).toBe("a")
  })

  test("appended tracks join the end of a shuffled round, which keeps its order", () => {
    const p = setUp(ABC, "off", true)
    const before = setUp(ABC, "off", true).walk()

    p.replace(list("a", "b", "c", "d", "e"))

    expect(p.walk()).toEqual([...before, "d", "e"])
  })

  test("appended tracks join the end of an unshuffled round", () => {
    const p = player(ABC)

    p.replace(list("a", "b", "c", "d"))

    expect(p.walk()).toEqual(["b", "c", "d"])
  })

  test("a reorder keeps retraced tracks out of the round, so none plays twice", () => {
    const p = player(ABC)

    p.send({ type: "play-track", id: "b" })
    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })
    p.send({ type: "previous" })
    p.replace(list("a", "c", "b"))

    expect(p.walk()).toEqual(["b", "c"])
  })

  test("tracks arriving in an empty player make the first one current", () => {
    const p = player(list())

    p.replace(ABC)

    expect(p.current()).toBe("a")
    expect(p.walk()).toEqual(["b", "c"])
  })

  test("the last track leaving empties the queue", () => {
    const p = player(ABC)

    p.replace(list())

    expect(p.current()).toBeNull()
  })
})

describe("playlist updates after a direct play skipped a track", () => {
  function skippedB() {
    const p = player(ABC)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })

    return p
  }

  test("an appended track joins the round, and the skipped track stays skipped", () => {
    const p = skippedB()

    p.replace(list("a", "b", "c", "d"))

    expect(p.current()).toBe("a")
    expect(p.walk()).toEqual(["c", "d"])
  })

  test("an update that keeps the same ids leaves the round alone", () => {
    const p = skippedB()

    p.replace(
      parsePlaylist(
        ["a", "b", "c"].map((id): WavePlayerTrack => ({ id, title: `${id} (remaster)`, src: `/${id}.mp3` }))
      ).playlist
    )

    expect(p.walk()).toEqual(["c"])
  })

  test("shuffled, an appended track joins the end and the skipped track stays skipped", () => {
    const p = setUp(ABC, "off", false)

    p.send({ type: "play-track", id: "c" })
    p.send({ type: "previous" })
    p.replace(list("a", "b", "c", "d"))

    expect(p.walk()).toEqual(["c", "d"])
  })
})
