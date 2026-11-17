/*
 * The player's one screen element, and the frames that hold it. Nothing
 * here knows React. The provider portals the site's `screen` into the
 * element once, and a frame's box holds the element while the frame is
 * mounted, so the screen moves between the card, the mini player, and
 * the bar without remounting, and keeps its canvas and its history.
 *
 * Holds stack. The newest hold has the element. A release hands it to the
 * newest hold still standing, and the last release takes it out of the
 * document, where a canvas inside reads 0x0 and stops drawing. React runs
 * a commit's layout cleanups before its layout effects, so a frame swap
 * releases the old box and holds the new one in one task, before any
 * observer or paint runs. Releases are idempotent, so StrictMode's extra
 * hold and release end where one hold does.
 *
 * `mounted` latches. It turns true at the first hold and stays true, so the
 * screen mounts with the first frame that mounts on the client, never on
 * the server, and then lives as long as the provider.
 */

/** The two DOM calls the dock makes. HTMLElement has both; tests pass fakes. */
export type DockNode<N> = {
  append(child: N): void
  remove(): void
}

export type ScreenDock<N extends DockNode<N> = HTMLElement> = {
  readonly subscribe: (listener: () => void) => () => void
  /** False until the first hold, then true for good. */
  readonly mounted: () => boolean
  /** The portal target, made on the first call. The provider reads it only once `mounted`, so only on the client. */
  readonly element: () => N
  /** Puts the element in `box` while this is the newest hold. The release is idempotent. */
  readonly hold: (box: N) => () => void
}

export function createScreenDock<N extends DockNode<N>>(
  make: () => N
): ScreenDock<N> {
  const listeners = new Set<() => void>()
  /** Each hold's box, oldest first. One entry per hold, so one box can be held twice. */
  const holds: { readonly box: N }[] = []
  let made: N | null = null
  let mounted = false

  const element = () => (made ??= make())

  return {
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    mounted: () => mounted,
    element,
    hold(box) {
      const entry = { box }

      holds.push(entry)
      box.append(element())

      if (!mounted) {
        mounted = true

        for (const listener of listeners) listener()
      }

      return () => {
        const at = holds.indexOf(entry)

        if (at === -1) return

        const newest = at === holds.length - 1

        holds.splice(at, 1)

        if (!newest) return

        const next = holds.at(-1)

        if (next) next.box.append(element())
        else element().remove()
      }
    },
  }
}
