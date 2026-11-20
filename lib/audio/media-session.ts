/** A player's claim on the page's one set of OS media controls. */
export type MediaClaim = {
  /** Whether this claim is still the newest, so its player answers the controls. */
  readonly owns: () => boolean
  /** Gives the controls up, if this claim still owns them. */
  readonly release: () => void
}

/** The newest claim. Every block on a page imports this one module, so they share it. */
let current: { readonly token: object; readonly revoke: () => void } | null =
  null

/**
 * Makes the caller the owner of the OS media controls, taking them from any
 * older claim. A player claims when it starts playing, and writes handlers
 * and playback state only while it owns them. When a newer claim takes the
 * controls, the older claim's `revoke` runs first, before the new owner
 * installs anything, so the older player removes every handler it set,
 * including actions the new owner doesn't use, such as next track. Release
 * does nothing once a newer claim holds the controls, so a player that
 * stopped earlier never clears the controls of the one that played last.
 */
export function claimMediaSession(revoke: () => void = () => {}): MediaClaim {
  const token = {}
  const previous = current

  current = { token, revoke }
  previous?.revoke()

  return {
    owns: () => current?.token === token,
    release() {
      if (current?.token === token) current = null
    },
  }
}
