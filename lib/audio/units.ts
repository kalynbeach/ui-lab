/*
 * Units and results shared by every file in kevelle/audio and by the blocks.
 *
 * Audio code mixes three clocks: performance.now() milliseconds, AudioContext
 * seconds, and sample frames. Each gets its own branded type so a
 * performance.now() value can't reach an AudioParam, and a frame count can't
 * pass for seconds. Brands are created only by the constructors below, which
 * callers reach after they have clamped external input at a boundary.
 */

declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

/** A frequency in hertz. Finite and greater than zero. */
export type Hz = Brand<number, "Hz">

/** A duration in seconds. Finite and zero or more. */
export type Seconds = Brand<number, "Seconds">

/** A time on an AudioContext clock (BaseAudioContext.currentTime). */
export type ContextTime = Brand<number, "ContextTime">

/**
 * An absolute sample frame on the context clock: an integer, where frame 0 is
 * the first frame the context rendered. AudioWorkletGlobalScope.currentFrame
 * counts in the same units, which is what lets the tap stamp each packet.
 */
export type Frame = Brand<number, "Frame">

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/** Throws RangeError for a non-finite or non-positive value. Clamp first. */
export function toHz(value: number): Hz {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`not a frequency: ${value}`)

  // SAFETY: checked finite and positive above, which is the Hz invariant.
  return value as Hz
}

/** Throws RangeError for a non-finite or negative value. Clamp first. */
export function toSeconds(value: number): Seconds {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`not a duration: ${value}`)

  // SAFETY: checked finite and non-negative above, which is the Seconds invariant.
  return value as Seconds
}

/** A context clock reading. Throws RangeError for a non-finite or negative value. */
export function toContextTime(value: number): ContextTime {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`not a context time: ${value}`)

  // SAFETY: checked finite and non-negative above; context clocks start at 0.
  return value as ContextTime
}

/** Floors to an integer frame. Throws RangeError for a non-finite value. */
export function toFrame(value: number): Frame {
  if (!Number.isFinite(value)) throw new RangeError(`not a frame: ${value}`)

  // SAFETY: Math.floor of a finite number is an integer, the Frame invariant.
  return Math.floor(value) as Frame
}

/** Clamps a parsed number into [min, max], or returns `fallback` when it is not finite. */
export function clampNumber(
  value: number,
  range: { readonly min: number; readonly max: number },
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback

  return Math.min(range.max, Math.max(range.min, value))
}

/**
 * How many decimals a control's step has: 0 for 1 Hz, 1 for 0.1 Hz, 2 for
 * 0.05. Reads the step's shortest text, so 0.1 counts one decimal and 1e-7
 * counts seven. Throws RangeError for a step that is not positive and finite.
 */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0)
    throw new RangeError(`not a step: ${step}`)

  const [mantissa, exponent = "0"] = String(step).split("e")
  const fraction = mantissa.split(".")[1]?.length ?? 0

  return Math.max(0, fraction - Number(exponent))
}

/**
 * A set value as every Kevelle block prints it: with exactly as many decimals
 * as its control's step, so a 0.1 Hz step prints 140.0 and a 1 Hz step prints
 * 400, whatever the value. Measured readings keep their own precision. A
 * negative value takes a true minus (U+2212), and a value that rounds to zero
 * prints without one. `signed` adds "+" to the rest, for offsets such as
 * detune. Callers add the unit.
 */
export function formatAtStep(
  value: number,
  step: number,
  options?: { readonly signed?: boolean }
): string {
  const digits = Math.abs(value).toFixed(stepDecimals(step))
  const negative = value < 0 && Number(digits) !== 0

  if (negative) return `−${digits}`

  return options?.signed ? `+${digits}` : digits
}
