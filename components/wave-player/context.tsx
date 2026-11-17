"use client"

/*
 * How a part reaches the player. WavePlayerProvider puts the page's one store
 * in this context, and every part reads it here, so a variant only lays parts
 * out and never touches the store.
 */

import * as React from "react"

import type { PlayerCommand, PlayerState } from "./model"
import type { PlayerStore } from "./store"

export const PlayerStoreContext = React.createContext<PlayerStore | null>(null)

export function usePlayerStore(caller: string): PlayerStore {
  const store = React.use(PlayerStoreContext)
  if (!store) throw new Error(`${caller} must render inside WavePlayerProvider`)
  return store
}

/**
 * One value from the player's snapshot, re-rendering the caller only when it
 * changes. `select` must return a value the snapshot holds (a field, or a
 * primitive derived from one), never a new object, or every notification
 * would look like a change.
 */
export function usePlayer<T>(select: (state: PlayerState) => T, caller = "usePlayer"): T {
  const store = usePlayerStore(caller)
  return React.useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getServerSnapshot())
  )
}

export function usePlayerSend(caller = "usePlayerSend"): (command: PlayerCommand) => void {
  return usePlayerStore(caller).send
}
