import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTriggerGate } from './triggerIntent';
import type { TriggerGateInputs, TriggerQueueState } from './triggerIntent';

/**
 * Milestone 7, Step 7E: deterministic regression coverage for the
 * queued-trigger phantom-shot bug in `VortexFireSystem.tsx`. Simulates the
 * frame-by-frame ref lifecycle (`triggerHeld`/`triggerQueued`) against
 * `resolveTriggerGate` without mounting any React/Three.js scene — mirrors
 * how `VortexFireSystem.tsx`'s `useFrame` calls this function and persists
 * `nextQueued` back into its own ref every frame.
 */

/** Minimal frame-loop simulator: drives `resolveTriggerGate` across a scripted sequence of per-frame conditions, threading `queued` through exactly as the real ref would be threaded. */
function runFrames(initial: TriggerQueueState, frames: Array<{ held: boolean } & TriggerGateInputs>) {
  let queued = initial.queued;
  const results: Array<{ shouldAttemptFire: boolean }> = [];
  for (const frame of frames) {
    const gate = resolveTriggerGate(
      { held: frame.held, queued },
      {
        hasControl: frame.hasControl,
        equipping: frame.equipping,
        reloading: frame.reloading,
        fireIntervalElapsed: frame.fireIntervalElapsed,
      },
    );
    queued = gate.nextQueued;
    results.push({ shouldAttemptFire: gate.shouldAttemptFire });
  }
  return { results, finalQueued: queued };
}

const BASE: TriggerGateInputs = { hasControl: true, equipping: false, reloading: false, fireIntervalElapsed: true };

describe('resolveTriggerGate (Step 7E — phantom shot after reload)', () => {
  it('single click during reload, released before completion, never fires once reload completes (the bug)', () => {
    const { results, finalQueued } = runFrames({ held: false, queued: false }, [
      // mousedown while reload is already active
      { held: true, ...BASE, reloading: true },
      // mouseup happens mid-reload -- held goes false, but the frame is still gated by reload
      { held: false, ...BASE, reloading: true },
      // a few more mid-reload frames tick by with nothing held or freshly clicked
      { held: false, ...BASE, reloading: true },
      // reload completes on this frame; nothing is held and nothing should be queued anymore
      { held: false, ...BASE, reloading: false },
    ]);
    assert.equal(finalQueued, false, 'queued flag must not survive a reload-blocked frame');
    assert.ok(
      results.every((r) => !r.shouldAttemptFire),
      'no frame in this sequence should have fired, including the one where reload completes',
    );
  });

  it('a trigger held continuously through reload completion still fires once reload ends (automatic-fire semantics preserved)', () => {
    const { results } = runFrames({ held: false, queued: false }, [
      { held: true, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: true },
      // reload completes while the button is still down -- must fire this frame
      { held: true, ...BASE, reloading: false },
    ]);
    assert.equal(results[results.length - 1].shouldAttemptFire, true, 'a continuously-held trigger must resume firing the instant reload completes');
  });

  it('a fresh click immediately after reload completes fires exactly once', () => {
    const { results } = runFrames({ held: false, queued: false }, [
      { held: false, ...BASE, reloading: true },
      // reload completes with nothing held/queued -- no shot
      { held: false, ...BASE, reloading: false },
      // a brand new click lands on the next frame -- must fire
      { held: true, ...BASE, reloading: false },
    ]);
    assert.deepEqual(
      results.map((r) => r.shouldAttemptFire),
      [false, false, true],
      'only the frame with the fresh post-reload click should fire',
    );
  });

  it('multiple blocked clicks during reload never accumulate into a queued burst once reload completes', () => {
    const { results } = runFrames({ held: false, queued: false }, [
      { held: true, ...BASE, reloading: true },
      { held: false, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: true },
      { held: false, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: true },
      { held: false, ...BASE, reloading: true },
      { held: false, ...BASE, reloading: false },
    ]);
    assert.ok(results.every((r) => !r.shouldAttemptFire), 'repeated clicks during an active reload must never produce a burst when reload ends');
  });

  it('reload initiated while firing (trigger already held) blocks the very next frame and still resumes on completion if still held', () => {
    const { results } = runFrames({ held: false, queued: false }, [
      // firing normally
      { held: true, ...BASE, reloading: false },
      // a reload begins (e.g. manual reload key) while the trigger is still physically held
      { held: true, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: true },
      { held: true, ...BASE, reloading: false },
    ]);
    assert.deepEqual(
      results.map((r) => r.shouldAttemptFire),
      [true, false, false, true],
      'firing should stop the instant reload starts and resume the instant it ends, matching held-trigger semantics',
    );
  });

  it('pause (loss of control) during reload clears nothing extra and blocks regardless of queued/held state', () => {
    const gate = resolveTriggerGate(
      { held: true, queued: true },
      { hasControl: false, equipping: false, reloading: true, fireIntervalElapsed: true },
    );
    assert.equal(gate.shouldAttemptFire, false);
    assert.equal(gate.nextQueued, true, 'the no-control branch is a pure pass-through -- VortexFireSystem\'s own separate hasControl effect is what actually clears the refs on pause/death');
  });

  it('a fresh mount (route remount) starts from held=false, queued=false and produces no fire on the first frame', () => {
    const gate = resolveTriggerGate({ held: false, queued: false }, BASE);
    assert.equal(gate.shouldAttemptFire, false);
    assert.equal(gate.nextQueued, false);
  });

  it('an RPM-cadence gate (not reload) preserves a queued click for a later eligible frame -- distinct from the reload-blocked path', () => {
    // A mousedown sets held AND queued together (as the real onMouseDown handler does) --
    // seed queued:true up front rather than relying on `held` to imply it, since runFrames
    // only threads `queued` through resolveTriggerGate and never derives it from `held`.
    const { results } = runFrames({ held: false, queued: true }, [
      { held: true, ...BASE, fireIntervalElapsed: false },
      { held: false, ...BASE, fireIntervalElapsed: false },
      // RPM window opens on a later frame with no new input -- the queued click must still fire
      { held: false, ...BASE, fireIntervalElapsed: true },
    ]);
    assert.deepEqual(
      results.map((r) => r.shouldAttemptFire),
      [false, false, true],
      'a click merely waiting on RPM cadence is not "rejected" the way a reload-blocked click is, and must survive to fire',
    );
  });

  it('is a pure boolean decision with no timing/frame-rate dependence -- every input combination returns a finite, defined result', () => {
    const bools = [true, false];
    for (const held of bools) {
      for (const queued of bools) {
        for (const hasControl of bools) {
          for (const equipping of bools) {
            for (const reloading of bools) {
              for (const fireIntervalElapsed of bools) {
                const gate = resolveTriggerGate({ held, queued }, { hasControl, equipping, reloading, fireIntervalElapsed });
                assert.equal(typeof gate.shouldAttemptFire, 'boolean');
                assert.equal(typeof gate.nextQueued, 'boolean');
              }
            }
          }
        }
      }
    }
  });
});
