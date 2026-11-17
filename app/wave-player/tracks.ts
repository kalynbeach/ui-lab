import type { WavePlayerTrack } from "@/components/wave-player/playlist"

const look = (ratio: string, screen: string, color: string) => ({
  tones: { ratio },
  look: { screen, color },
})

export const TRACKS = [
  {
    id: "low-tide",
    title: "Low tide",
    src: "/samples/wave-player/low-tide.mp3",
    duration: 32,
    look: look("5:4", "p31", "auto"),
  },
  {
    id: "glass-current",
    title: "Glass current",
    src: "/samples/wave-player/glass-current.mp3",
    duration: 28,
    look: look("3:2", "neutral", "astral"),
  },
  {
    id: "night-transit",
    title: "Night transit",
    src: "/samples/wave-player/night-transit.mp3",
    duration: 36,
    look: look("1:phi", "neutral", "magenta"),
  },
  {
    id: "afterimage",
    title: "Afterimage",
    src: "/samples/wave-player/afterimage.mp3",
    duration: 24,
    look: look("4:3", "neutral", "flame"),
  },
  {
    id: "field-recording-07",
    title: "Field recording 07",
    src: "/samples/wave-player/field-recording-07.mp3",
    duration: 40,
    look: look("2:1", "neutral", "chrome"),
  },
] as const satisfies readonly WavePlayerTrack[]
