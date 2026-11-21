"use client"

import { createParts } from "@ui-sdk/react/primitive"

import { playlistGrid } from "./playlist-grid"

export const PlaylistGrid = createParts(playlistGrid, {
  root: "div",
  row: "div",
  track: "div",
  "play-cell": "div",
  play: "button",
})
