import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeActionPose, createActionPose, type ActionKind, type FirstPersonActionPose } from './actionPose';

const CANON_RIGHT = 0.0;
const CANON_LEFT = 0.3;

function pose(kind: ActionKind, progress: number, out?: FirstPersonActionPose): FirstPersonActionPose {
  return computeActionPose({ kind, progress, canonicalRightFingerCurl: CANON_RIGHT, canonicalLeftFingerCurl: CANON_LEFT }, out);
}

function isFinitePose(p: FirstPersonActionPose): boolean {
  return (
    p.weaponPositionOffset.every(Number.isFinite) &&
    p.weaponRotationOffset.every(Number.isFinite) &&
    Number.isFinite(p.rightHandIkWeight) &&
    Number.isFinite(p.leftHandIkWeight) &&
    Number.isFinite(p.rightFingerCurlScale) &&
    Number.isFinite(p.leftFingerCurlScale) &&
    Number.isFinite(p.leftActionTargetWeight)
  );
}

describe('actionPose — idle', () => {
  it('returns the exact canonical/no-op pose', () => {
    const p = pose('idle', 0);
    assert.deepEqual(p.weaponPositionOffset, [0, 0, 0]);
    assert.deepEqual(p.weaponRotationOffset, [0, 0, 0]);
    assert.equal(p.rightHandIkWeight, 1);
    assert.equal(p.leftHandIkWeight, 1);
    assert.equal(p.rightFingerCurlScale, CANON_RIGHT);
    assert.equal(p.leftFingerCurlScale, CANON_LEFT);
    assert.equal(p.leftActionTargetWeight, 0);
    assert.equal(p.actionPhase, 'idle');
  });

  it('ignores progress entirely when idle', () => {
    const a = pose('idle', 0);
    const b = pose('idle', 0.73);
    assert.deepEqual(a, b);
  });
});

describe('actionPose — reload phase boundaries', () => {
  it('reports reloadSettle just after 0, reloadManipulate mid-way, reloadReturn near the end', () => {
    assert.equal(pose('reload', 0.01).actionPhase, 'reloadSettle');
    assert.equal(pose('reload', 0.29).actionPhase, 'reloadSettle');
    assert.equal(pose('reload', 0.3).actionPhase, 'reloadManipulate');
    assert.equal(pose('reload', 0.5).actionPhase, 'reloadManipulate');
    assert.equal(pose('reload', 0.69).actionPhase, 'reloadManipulate');
    assert.equal(pose('reload', 0.7).actionPhase, 'reloadReturn');
    assert.equal(pose('reload', 0.99).actionPhase, 'reloadReturn');
  });

  it('right hand never leaves weight 1 at any point in the reload', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      assert.equal(pose('reload', p).rightHandIkWeight, 1);
    }
  });

  it('right finger curl stays exactly at canonical throughout reload (never mimics firing)', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      assert.equal(pose('reload', p).rightFingerCurlScale, CANON_RIGHT);
    }
  });

  it('left-hand action-target weight rises from 0, peaks at 1 during manipulation, returns to 0', () => {
    assert.equal(pose('reload', 0).leftActionTargetWeight, 0);
    assert.ok(pose('reload', 0.5).leftActionTargetWeight === 1);
    assert.equal(pose('reload', 1).leftActionTargetWeight, 0);
  });

  it('left-hand action-target weight is monotonically non-decreasing through the settle phase', () => {
    let prev = -1;
    for (let p = 0; p <= 0.3; p += 0.02) {
      const w = pose('reload', p).leftActionTargetWeight;
      assert.ok(w >= prev - 1e-9, `weight decreased at p=${p}: ${prev} -> ${w}`);
      prev = w;
    }
  });

  it('left-hand action-target weight is monotonically non-increasing through the return phase', () => {
    let prev = 2;
    for (let p = 0.7; p <= 1; p += 0.02) {
      const w = pose('reload', p).leftActionTargetWeight;
      assert.ok(w <= prev + 1e-9, `weight increased at p=${p}: ${prev} -> ${w}`);
      prev = w;
    }
  });

  it('left hand IK weight softens slightly during manipulation but never drops far from 1 (no floating hand)', () => {
    const mid = pose('reload', 0.5).leftHandIkWeight;
    assert.ok(mid >= 0.8 && mid <= 1, `expected a restrained softening, got ${mid}`);
  });

  it('left finger curl rises above canonical during manipulation and returns to canonical at completion', () => {
    assert.equal(pose('reload', 0).leftFingerCurlScale, CANON_LEFT);
    assert.ok(pose('reload', 0.5).leftFingerCurlScale > CANON_LEFT);
    assert.equal(pose('reload', 1).leftFingerCurlScale, CANON_LEFT);
  });

  it('exact canonical recovery: progress 1 reproduces idle byte-for-byte on every hand/finger field', () => {
    const end = pose('reload', 1);
    const idle = pose('idle', 0);
    assert.equal(end.rightHandIkWeight, idle.rightHandIkWeight);
    assert.equal(end.leftHandIkWeight, idle.leftHandIkWeight);
    assert.equal(end.rightFingerCurlScale, idle.rightFingerCurlScale);
    assert.equal(end.leftFingerCurlScale, idle.leftFingerCurlScale);
    assert.equal(end.leftActionTargetWeight, idle.leftActionTargetWeight);
  });

  it('weapon Y offset reproduces the proven dip curve (down at 0.35, holds, rises by 0.85)', () => {
    assert.ok(pose('reload', 0.35).weaponPositionOffset[1] < -0.15);
    assert.ok(pose('reload', 0.45).weaponPositionOffset[1] < -0.15); // still in the hold band
    assert.ok(Math.abs(pose('reload', 0.85).weaponPositionOffset[1]) < 0.02); // back near neutral
  });

  it('weapon X/Z offset and rotation stay zero throughout reload (unchanged shape from before this pass)', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const r = pose('reload', p);
      assert.equal(r.weaponPositionOffset[0], 0);
      assert.equal(r.weaponPositionOffset[2], 0);
      assert.deepEqual(r.weaponRotationOffset, [0, 0, 0]);
    }
  });
});

describe('actionPose — inspect phase boundaries', () => {
  it('reports inspectAnticipate early, inspectHold mid-way, inspectReturn near the end', () => {
    assert.equal(pose('inspect', 0.01).actionPhase, 'inspectAnticipate');
    assert.equal(pose('inspect', 0.14).actionPhase, 'inspectAnticipate');
    assert.equal(pose('inspect', 0.15).actionPhase, 'inspectHold');
    assert.equal(pose('inspect', 0.5).actionPhase, 'inspectHold');
    assert.equal(pose('inspect', 0.74).actionPhase, 'inspectHold');
    assert.equal(pose('inspect', 0.75).actionPhase, 'inspectReturn');
    assert.equal(pose('inspect', 0.99).actionPhase, 'inspectReturn');
  });

  it('right hand never leaves weight 1 and right curl never leaves canonical', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const r = pose('inspect', p);
      assert.equal(r.rightHandIkWeight, 1);
      assert.equal(r.rightFingerCurlScale, CANON_RIGHT);
    }
  });

  it('left action-target weight peaks at 0.6 (a looser reposition than reload, never a full release)', () => {
    const hold = pose('inspect', 0.5).leftActionTargetWeight;
    assert.ok(Math.abs(hold - 0.6) < 1e-6, `expected 0.6 peak, got ${hold}`);
  });

  it('left finger curl relaxes BELOW canonical during the hold (an open sliding hand, not a tightened grip)', () => {
    assert.ok(pose('inspect', 0.5).leftFingerCurlScale < CANON_LEFT);
  });

  it('weapon yaw/roll/lift rise during anticipation, hold at a readable presentation angle, and return to zero', () => {
    const anticipateEnd = pose('inspect', 0.15);
    const hold = pose('inspect', 0.5);
    const end = pose('inspect', 1);
    assert.ok(anticipateEnd.weaponRotationOffset[1] > 0, 'should have started yawing by the end of anticipation');
    assert.ok(hold.weaponRotationOffset[1] > 0.3, 'should hold a readable yaw angle');
    assert.ok(Math.abs(end.weaponRotationOffset[1]) < 1e-6, 'should return fully to zero');
  });

  it('weapon rotation stays restrained (never an arcade-style full spin)', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const r = pose('inspect', p);
      assert.ok(Math.abs(r.weaponRotationOffset[1]) <= Math.PI / 2, `yaw exceeded 90deg at p=${p}`);
    }
  });

  it('exact canonical recovery at progress 1', () => {
    const end = pose('inspect', 1);
    const idle = pose('idle', 0);
    assert.equal(end.rightHandIkWeight, idle.rightHandIkWeight);
    assert.equal(end.leftHandIkWeight, idle.leftHandIkWeight);
    assert.equal(end.rightFingerCurlScale, idle.rightFingerCurlScale);
    assert.equal(end.leftFingerCurlScale, idle.leftFingerCurlScale);
    assert.equal(end.leftActionTargetWeight, idle.leftActionTargetWeight);
    assert.deepEqual(end.weaponPositionOffset, idle.weaponPositionOffset);
  });
});

describe('actionPose — normalized progress clamping and finite output', () => {
  it('clamps out-of-range progress instead of extrapolating', () => {
    const overshoot = pose('reload', 1.5);
    const atOne = pose('reload', 1);
    assert.deepEqual(overshoot, atOne);
    const undershoot = pose('reload', -0.5);
    const atZero = pose('reload', 0);
    assert.deepEqual(undershoot, atZero);
  });

  it('treats non-finite progress as 0 rather than propagating NaN', () => {
    const nanProgress = pose('reload', NaN);
    assert.ok(isFinitePose(nanProgress));
    const atZero = pose('reload', 0);
    assert.deepEqual(nanProgress, atZero);
  });

  it('treats non-finite canonical curl inputs as 0 rather than propagating NaN', () => {
    const p = computeActionPose({ kind: 'idle', progress: 0, canonicalRightFingerCurl: NaN, canonicalLeftFingerCurl: Infinity });
    assert.ok(isFinitePose(p));
    assert.equal(p.rightFingerCurlScale, 0);
    assert.equal(p.leftFingerCurlScale, 0);
  });

  it('every output field is finite across the full progress range, both actions', () => {
    for (const kind of ['reload', 'inspect'] as const) {
      for (let p = -0.2; p <= 1.2; p += 0.05) {
        assert.ok(isFinitePose(pose(kind, p)), `non-finite output for ${kind} at p=${p}`);
      }
    }
  });
});

describe('actionPose — determinism, frame-rate independence, and no drift', () => {
  it('is a pure function of its inputs: same (kind, progress, canonical) always produces the same output', () => {
    const a = pose('reload', 0.42);
    const b = pose('reload', 0.42);
    assert.deepEqual(a, b);
  });

  it('is frame-rate independent: sampling at coarse vs fine progress steps agrees at shared sample points (progress is the only time input, never call count)', () => {
    // Simulate "60fps" sampling every 1/60 progress-equivalent step vs "20fps" every 1/20 step; both must agree exactly at any progress value they share, since the function has no hidden per-call state.
    const shared = 0.6;
    const a = pose('reload', shared);
    // Call it 50 extra times at unrelated progress values first, to prove no hidden accumulation affects a later call at the same progress.
    for (let i = 0; i < 50; i++) pose('reload', (i / 50) % 1);
    const b = pose('reload', shared);
    assert.deepEqual(a, b);
  });

  it('no drift after repeated calls with a persistent output object (mutate-in-place correctness)', () => {
    const out = createActionPose();
    for (let i = 0; i < 200; i++) {
      pose('reload', (i % 100) / 100, out);
    }
    // Last iteration was i=199 -> (199 % 100)/100 = 0.99
    const fresh = pose('reload', 0.99);
    assert.deepEqual(out, fresh);
  });

  it('no per-call allocation when an output object is supplied: the SAME object/array references are reused, only their contents change', () => {
    const out = createActionPose();
    const posArrayRef = out.weaponPositionOffset;
    const rotArrayRef = out.weaponRotationOffset;
    pose('inspect', 0.3, out);
    pose('reload', 0.7, out);
    assert.equal(out.weaponPositionOffset, posArrayRef);
    assert.equal(out.weaponRotationOffset, rotArrayRef);
  });

  it('falls back to a fresh object when none is supplied (safe for tests/one-off calls, never required on the hot path)', () => {
    const a = pose('idle', 0);
    const b = pose('idle', 0);
    assert.notEqual(a, b); // different object identities
    assert.deepEqual(a, b); // same values
  });
});

describe('actionPose — reload vs inspect are visually distinct (not the same curve reused)', () => {
  it('reload releases the hand further than inspect at their respective peaks', () => {
    const reloadPeak = pose('reload', 0.5).leftActionTargetWeight;
    const inspectPeak = pose('inspect', 0.5).leftActionTargetWeight;
    assert.ok(reloadPeak > inspectPeak, `expected reload (${reloadPeak}) to release further than inspect (${inspectPeak})`);
  });

  it('reload tightens the left-hand curl while inspect relaxes it — opposite directions, not the same shape', () => {
    const reloadCurl = pose('reload', 0.5).leftFingerCurlScale;
    const inspectCurl = pose('inspect', 0.5).leftFingerCurlScale;
    assert.ok(reloadCurl > CANON_LEFT, 'reload should tighten');
    assert.ok(inspectCurl < CANON_LEFT, 'inspect should relax');
  });
});
