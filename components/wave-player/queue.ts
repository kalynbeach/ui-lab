/*
 * The order Next and Previous walk. Pure: the store keeps one Queue in its
 * intent, and model.ts plans every move through these functions.
 *
 * A ready queue keeps what actually played, not a cursor into the list:
 *
 *   past      tracks played before current, oldest first. Previous returns
 *             through it. An id may repeat, since a track can play twice.
 *   current   the track the player shows and plays.
 *   forward   tracks Previous stepped back over, nearest first. Next
 *             retraces them before anything new.
 *   pending   this round's tracks not yet visited, in play order: the Playlist
 *             order after current, or one shuffled order of every other
 *             track. Never holds current or a forward id.
 *   seed      the shuffle's random state. Only a move that shuffles advances
 *             it, so a peek and the move it predicts agree.
 *
 * Only this file builds a Queue. Each builder keeps pending free of
 * duplicates and disjoint from current and forward, and every id a member of
 * the order it was given.
 */

import type { TrackId } from "./playlist"

declare const checked: unique symbol

export type Queue = (
  | { readonly kind: "empty"; readonly seed: number }
  | {
      readonly kind: "ready"
      readonly past: readonly TrackId[]
      readonly current: TrackId
      readonly forward: readonly TrackId[]
      readonly pending: readonly TrackId[]
      readonly seed: number
    }
) & { readonly [checked]: true }

type Ready = Extract<Queue, { kind: "ready" }>

type Fields =
  | { readonly kind: "empty"; readonly seed: number }
  | Omit<Ready, typeof checked>

function make(fields: Fields): Queue {
  // SAFETY: every caller below builds `fields` from a checked order and keeps the invariants above.
  return fields as Queue
}

/** The first track current, nothing played, and the rest of the round pending. */
export function createQueue(
  order: readonly TrackId[],
  shuffle: boolean,
  seed: number
): Queue {
  const current = order[0]

  if (current === undefined) return make({ kind: "empty", seed })

  const round = pendingAfter(order, current, [], shuffle, seed)

  return make({
    kind: "ready",
    past: [],
    current,
    forward: [],
    pending: round.ids,
    seed: round.seed,
  })
}

export function currentOf(queue: Queue): TrackId | null {
  return queue.kind === "ready" ? queue.current : null
}

/** The same queue on a new random state, for the store's first draw from its environment. */
export function reseed(queue: Queue, seed: number): Queue {
  return make({ ...queue, seed })
}

/**
 * Next: the nearest forward track, else the first pending one. With nothing
 * left, `wrap` starts a new round, and its first track is not current when
 * the order holds another. Null when nothing follows.
 */
export function advance(
  queue: Queue,
  order: readonly TrackId[],
  shuffle: boolean,
  wrap: boolean
): Queue | null {
  if (queue.kind === "empty") return null

  const past = [...queue.past, queue.current]
  const [retrace, ...forward] = queue.forward

  if (retrace !== undefined)
    return make({ ...queue, past, current: retrace, forward })

  const [visit, ...pending] = queue.pending

  if (visit !== undefined)
    return make({ ...queue, past, current: visit, pending })

  if (!wrap) return null

  const round = shuffle
    ? permute(order, queue.seed)
    : { ids: [...order], seed: queue.seed }

  if (round.ids.length > 1 && round.ids[0] === queue.current)
    round.ids.push(round.ids.shift()!)

  const [first, ...rest] = round.ids

  if (first === undefined) return null

  return make({
    kind: "ready",
    past,
    current: first,
    forward: [],
    pending: rest,
    seed: round.seed,
  })
}

/**
 * Previous: the last track played, with current kept for Next to retrace.
 * The track it returns to leaves pending, since it is current again. Null
 * with no past.
 */
export function retreat(queue: Queue): Queue | null {
  if (queue.kind === "empty") return null

  const back = queue.past.at(-1)

  if (back === undefined) return null

  return make({
    ...queue,
    past: queue.past.slice(0, -1),
    current: back,
    forward: [queue.current, ...queue.forward],
    pending: queue.pending.filter((id) => id !== back),
  })
}

/**
 * A direct play of another track: current joins the past, forward history
 * ends, and a new round starts after the played track.
 */
export function activate(
  queue: Queue,
  id: TrackId,
  order: readonly TrackId[],
  shuffle: boolean
): Queue {
  const past = queue.kind === "ready" ? [...queue.past, queue.current] : []
  const round = pendingAfter(order, id, [], shuffle, queue.seed)

  return make({
    kind: "ready",
    past,
    current: id,
    forward: [],
    pending: round.ids,
    seed: round.seed,
  })
}

/**
 * Shuffle turned on or off. Past and current stay; forward history ends,
 * since the order it retraced no longer applies; pending becomes the new
 * order's round after current.
 */
export function reshuffle(
  queue: Queue,
  order: readonly TrackId[],
  shuffle: boolean
): Queue {
  if (queue.kind === "empty") return queue

  const round = pendingAfter(order, queue.current, [], shuffle, queue.seed)

  return make({ ...queue, forward: [], pending: round.ids, seed: round.seed })
}

/**
 * The playlist changed. Every part keeps only ids still listed. Current stays
 * by id; when the list dropped it, the first track becomes current with no
 * history. Unshuffled, pending follows the new Playlist order after current.
 * Shuffled, pending keeps its order and new tracks join its end in Playlist
 * order.
 */
export function reconcile(
  queue: Queue,
  order: readonly TrackId[],
  shuffle: boolean
): Queue {
  const listed = new Set(order)

  if (queue.kind === "empty" || !listed.has(queue.current))
    return createQueue(order, shuffle, queue.seed)

  const past = queue.past.filter((id) => listed.has(id))
  const forward = queue.forward.filter((id) => listed.has(id))

  if (!shuffle) {
    const round = pendingAfter(order, queue.current, forward, false, queue.seed)

    return make({ ...queue, past, forward, pending: round.ids })
  }

  const known = new Set([
    ...queue.past,
    queue.current,
    ...queue.forward,
    ...queue.pending,
  ])

  const taken = new Set([queue.current, ...forward])

  const pending = [
    ...queue.pending.filter((id) => listed.has(id) && !taken.has(id)),
    ...order.filter((id) => !known.has(id)),
  ]

  return make({ ...queue, past, forward, pending })
}

/** A round after `current`: the Playlist order after it, or a shuffle of every other track. */
function pendingAfter(
  order: readonly TrackId[],
  current: TrackId,
  skip: readonly TrackId[],
  shuffle: boolean,
  seed: number
): { readonly ids: TrackId[]; readonly seed: number } {
  const taken = new Set([current, ...skip])

  if (shuffle)
    return permute(
      order.filter((id) => !taken.has(id)),
      seed
    )

  return {
    ids: order.slice(order.indexOf(current) + 1).filter((id) => !taken.has(id)),
    seed,
  }
}

/** A Fisher-Yates shuffle driven by `seed`, and the seed after it. */
function permute(
  ids: readonly TrackId[],
  seed: number
): { readonly ids: TrackId[]; readonly seed: number } {
  const out = [...ids]
  let state = seed

  for (let at = out.length - 1; at > 0; at -= 1) {
    const draw = random(state)

    state = draw.seed

    const pick = Math.floor(draw.value * (at + 1))

    ;[out[at], out[pick]] = [out[pick], out[at]]
  }

  return { ids: out, seed: state }
}

/** mulberry32: a value in [0, 1) and the next 32-bit state. */
function random(seed: number): { readonly value: number; readonly seed: number } {
  const next = (seed + 0x6d2b79f5) | 0
  let mixed = Math.imul(next ^ (next >>> 15), next | 1)

  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)

  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, seed: next }
}
