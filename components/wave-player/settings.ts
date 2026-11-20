/*
 * The listener's settings. They hold with no tracks, so a player restores
 * them before its first track arrives.
 */

export type Repeat = "off" | "all" | "one"


export type Settings = {
  /** 0 to 1. The strip squares it under the player's ceiling. */
  readonly level: number
  /** The strip's output is off. The waveform's tap keeps running. */
  readonly muted: boolean
  readonly shuffle: boolean
  readonly repeat: Repeat
}

export const DEFAULT_SETTINGS: Settings = {
  level: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
}

/** Where settings persist. read() and write() never throw: a store that refuses leaves the player usable. */
export type SettingsStorage = {
  readonly read: () => string | null
  readonly write: (text: string) => void
}

const VERSION = 1

/** The stored text for `settings`. parseSettings() reads it back. */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ version: VERSION, ...settings })
}

/**
 * Stored text as settings: null when it is missing, not JSON, or another
 * version. A field that does not check out falls back to its default, and
 * the level clamps into 0 to 1.
 */
export function parseSettings(text: string | null): Settings | null {
  if (text === null) return null

  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof value !== "object" || value === null) return null

  const record = value as Record<string, unknown>

  if (record.version !== VERSION) return null

  const { level, muted, shuffle, repeat } = record

  return {
    level:
      typeof level === "number" && Number.isFinite(level)
        ? Math.min(1, Math.max(0, level))
        : DEFAULT_SETTINGS.level,
    muted: typeof muted === "boolean" ? muted : DEFAULT_SETTINGS.muted,
    shuffle: typeof shuffle === "boolean" ? shuffle : DEFAULT_SETTINGS.shuffle,
    repeat:
      repeat === "off" || repeat === "all" || repeat === "one"
        ? repeat
        : DEFAULT_SETTINGS.repeat,
  }
}

/** `key` in the page's localStorage. Private browsing, a full quota, and blocked storage read as nothing saved. */
export function localSettings(
  key: string,
  storage: () => Storage = () => localStorage
): SettingsStorage {
  return {
    read() {
      try {
        return storage().getItem(key)
      } catch {
        return null
      }
    },
    write(text) {
      try {
        storage().setItem(key, text)
      } catch {}
    },
  }
}
