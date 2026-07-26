/**
 * Pure, dependency-free concurrent-voice bookkeeping for procedural weapon
 * SFX (Milestone 7, Phase G, Step 7F). Extracted out of `vortexAudio.ts` so
 * the bounding behavior — "automatic fire must never spawn unbounded Web
 * Audio nodes" — is deterministically testable without a real
 * `AudioContext`, same convention as `resolveTriggerGate`/`resolveWeaponState`.
 *
 * A "voice" here is one in-flight procedural sound (e.g. one `shot()`
 * burst's noise+tone pair). The caller acquires a slot before spawning the
 * Web Audio nodes and releases it once they've finished (or on a fixed
 * timer matching the sound's own duration — see `vortexAudio.ts`).
 */
export class VoiceBudget {
  private active = 0;

  constructor(private readonly max: number) {
    if (!Number.isFinite(max) || max < 1) throw new Error('VoiceBudget max must be a finite number >= 1');
  }

  /** True and reserves a slot if under budget; false (no reservation) if at capacity. */
  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active += 1;
    return true;
  }

  /** Releases one previously-acquired slot. Safe to call more times than acquired (clamped at 0) so a caller's cleanup path never needs to track whether it actually acquired. */
  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  get count(): number {
    return this.active;
  }

  get capacity(): number {
    return this.max;
  }

  /** Forces the active count back to zero regardless of outstanding acquires — for a dev-only "reset audio state" control, never called from a normal playback path. */
  reset(): void {
    this.active = 0;
  }
}

/**
 * Guards a sound that must never overlap itself (e.g. the multi-tone reload
 * jingle) — at most one logical "run" active at a time. `start()` returns
 * false if a run is already active; the caller is expected to call `stop()`
 * once its own scheduled sequence completes (or to cancel early).
 */
export class SingleVoiceGuard {
  private activeToken = 0;
  private nextToken = 1;

  /** Returns a token to pass to `stop()` if a new run was allowed to start, or null if one was already active. */
  start(): number | null {
    if (this.activeToken !== 0) return null;
    this.activeToken = this.nextToken;
    this.nextToken += 1;
    return this.activeToken;
  }

  /** Clears the active run only if `token` matches the run that's still active (a stale/late stop from a superseded run is a no-op). */
  stop(token: number): void {
    if (this.activeToken === token) this.activeToken = 0;
  }

  get isActive(): boolean {
    return this.activeToken !== 0;
  }

  /** Forces the guard clear regardless of which run (if any) is active — for a dev-only "reset audio state" control, never called from a normal playback path. */
  forceRelease(): void {
    this.activeToken = 0;
  }
}
