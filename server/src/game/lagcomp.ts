import { INTERPOLATION_DELAY_MS } from '../../../shared/protocol';

/** Smoothing factor for the per-player RTT estimate. */
export const RTT_EMA_ALPHA = 0.2;

/** Sentinel for "no RTT sample yet" — treated as zero rewind contribution. */
export const RTT_UNSET = -1;

/**
 * Fold a new RTT sample into the running EMA. Implausible samples (negative,
 * non-finite, or > 2 s) are ignored so one spurious reading can't poison the
 * estimate; the first valid sample seeds the average directly.
 */
export function updateRttEma(previous: number, sample: number): number {
  if (!Number.isFinite(sample) || sample < 0 || sample > 2000) return previous;
  return previous < 0 ? sample : previous + (sample - previous) * RTT_EMA_ALPHA;
}

/**
 * The server time a shooter's victims should be rewound to: half the
 * shooter's RTT (their view lags the server by that much) plus the client's
 * render interpolation delay, clamped so a spiking connection can't rewind
 * the world too far (bounds the peeker's advantage).
 */
export function rewindTime(now: number, rttMs: number, maxRewindMs: number): number {
  const rtt = rttMs > 0 ? rttMs : 0;
  const rewind = Math.min(rtt / 2 + INTERPOLATION_DELAY_MS, maxRewindMs);
  return now - rewind;
}
