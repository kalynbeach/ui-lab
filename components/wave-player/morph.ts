// Frames never pair. Each frame's <ViewTransition> has no name, so the
// leaving frame shrinks at its own box while the arriving one grows at its
// own box, at the same time. The screen's canvas has no view-transition name
// either, so it shows inside whichever frame's snapshot holds it.

// The Playlist has no frame.
export type FrameKind = "card" | "mini" | "bar"

// "unknown" is the server and hydration.
export type MountMotion = "full" | "reduced" | "unknown"

export const FRAME_MOTION = {
  enter: "wave-player-grow",
  exit: "wave-player-shrink",
} as const

// React starts a view transition for every <ViewTransition> a transition
// commit places, whatever its triggers, so a frame that mounts under reduced
// motion renders none. A server-rendered frame mounts as "unknown" and wraps,
// so hydration matches, and its triggers stay off until the preference is known.
export function frameWraps(motion: MountMotion): boolean {
  return motion !== "reduced"
}

export function frameMotion(motion: MountMotion) {
  return motion === "full" ? FRAME_MOTION : { enter: "none", exit: "none" }
}
