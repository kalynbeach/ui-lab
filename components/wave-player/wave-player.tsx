"use client"

// A host mounts WavePlayerProvider with its tracks where it outlives
// navigation, such as a layout, and places variants under it. The provider
// owns the store, the one canvas every WavePlayerScreen shows, and the one
// live region, so a page announces a change once however many variants it shows.

import * as React from "react"

import { parseWaveformConfig } from "@/components/waveform/settings"
import { WaveformProvider } from "@/components/waveform/waveform"

import { PlayerStoreContext, usePlayer } from "./context"
import type { WavePlayerStatus } from "./model"
import type { WavePlayerTrack } from "./playlist"
import { announcement, STATUS_VIEW } from "./status-view"
import { browserEnv, createPlayerStore, type PlayerStore } from "./store"

// A default key, so Mute holds across reloads when the host passes only tracks.
export const DEFAULT_SETTINGS_KEY = "wave-player"

export function WavePlayerProvider({
  tracks,
  settingsKey = DEFAULT_SETTINGS_KEY,
  children,
}: {
  readonly tracks: readonly WavePlayerTrack[]
  readonly settingsKey?: string
  readonly children: React.ReactNode
}) {
  const [store] = React.useState(() =>
    createPlayerStore(tracks, browserEnv(settingsKey))
  )

  React.useEffect(() => store.setTracks(tracks), [store, tracks])

  return <WavePlayerStore store={store}>{children}</WavePlayerStore>
}

// The provider around a store built elsewhere, for tests with a fake environment.
export function WavePlayerStore({
  store,
  children,
}: {
  readonly store: PlayerStore
  readonly children: React.ReactNode
}) {
  React.useEffect(() => store.restoreSettings(), [store])
  React.useEffect(() => () => store.release(), [store])

  return (
    <PlayerStoreContext value={store}>
      <Screen>{children}</Screen>
      <Announcer />
    </PlayerStoreContext>
  )
}

function Screen({ children }: { readonly children: React.ReactNode }) {
  const look = usePlayer((state) => state.look)
  const feed = usePlayer((state) => state.feed)
  const status = usePlayer((state) => state.status.kind)
  const config = React.useMemo(() => parseWaveformConfig(look), [look])

  return (
    <WaveformProvider
      config={config}
      audio={feed}
      hold={STATUS_VIEW[status].hold}
      viewTransitionName={null}
    >
      {children}
    </WaveformProvider>
  )
}

function Announcer() {
  const summary = usePlayer((state) => state.summary)

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement(summary)}
    </p>
  )
}

// A host mounts the mini or the bar by `active`.
export function useWavePlayer(): {
  readonly status: WavePlayerStatus
  readonly active: boolean
} {
  const status = usePlayer((state) => state.summary, "useWavePlayer")
  const active = usePlayer((state) => state.active, "useWavePlayer")

  return { status, active }
}
