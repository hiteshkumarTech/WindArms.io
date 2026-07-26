import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SingleVoiceGuard, VoiceBudget } from './audioVoiceBudget';

describe('VoiceBudget (Step 7F — bounded concurrent weapon-SFX voices)', () => {
  it('acquires up to capacity and rejects beyond it', () => {
    const budget = new VoiceBudget(3);
    assert.equal(budget.tryAcquire(), true);
    assert.equal(budget.tryAcquire(), true);
    assert.equal(budget.tryAcquire(), true);
    assert.equal(budget.count, 3);
    assert.equal(budget.tryAcquire(), false, 'a 4th acquire beyond capacity 3 must be rejected');
    assert.equal(budget.count, 3, 'a rejected acquire must not increment the count');
  });

  it('releasing frees a slot for a subsequent acquire', () => {
    const budget = new VoiceBudget(1);
    assert.equal(budget.tryAcquire(), true);
    assert.equal(budget.tryAcquire(), false);
    budget.release();
    assert.equal(budget.count, 0);
    assert.equal(budget.tryAcquire(), true, 'a released slot must become acquirable again');
  });

  it('release() is safe to call more times than acquired -- clamps at zero, never negative', () => {
    const budget = new VoiceBudget(5);
    budget.release();
    budget.release();
    assert.equal(budget.count, 0);
    assert.equal(budget.tryAcquire(), true, 'over-releasing must not corrupt future acquires');
  });

  it('exposes capacity unchanged across acquire/release cycles', () => {
    const budget = new VoiceBudget(4);
    budget.tryAcquire();
    budget.release();
    assert.equal(budget.capacity, 4);
  });

  it('rejects a non-finite or sub-1 max at construction (fails loud, not silently unbounded)', () => {
    assert.throws(() => new VoiceBudget(0));
    assert.throws(() => new VoiceBudget(-1));
    assert.throws(() => new VoiceBudget(NaN));
    assert.throws(() => new VoiceBudget(Infinity));
  });

  it('sustained rapid acquire/release (simulating automatic fire) never exceeds capacity and never goes negative', () => {
    const budget = new VoiceBudget(6);
    let rejections = 0;
    for (let i = 0; i < 200; i++) {
      if (budget.tryAcquire()) {
        assert.ok(budget.count <= 6, `count must never exceed capacity, saw ${budget.count}`);
      } else {
        rejections++;
      }
      if (i % 3 === 0) budget.release();
    }
    assert.ok(budget.count >= 0);
    // With releases happening roughly every 3rd iteration against acquires every iteration, the budget should saturate and start rejecting at some point.
    assert.ok(rejections > 0, 'a sustained acquire-heavy loop against a small budget should hit the cap at least once');
  });

  it('reset() forces the count back to zero regardless of outstanding acquires -- dev-only reset path', () => {
    const budget = new VoiceBudget(2);
    budget.tryAcquire();
    budget.tryAcquire();
    assert.equal(budget.count, 2);
    budget.reset();
    assert.equal(budget.count, 0);
    assert.equal(budget.tryAcquire(), true);
  });
});

describe('SingleVoiceGuard (Step 7F — reload jingle must never overlap itself)', () => {
  it('the first start() succeeds and returns a token', () => {
    const guard = new SingleVoiceGuard();
    const token = guard.start();
    assert.notEqual(token, null);
    assert.equal(guard.isActive, true);
  });

  it('a second start() while active is rejected (returns null) -- prevents overlapping reload jingles', () => {
    const guard = new SingleVoiceGuard();
    const first = guard.start();
    assert.notEqual(first, null);
    const second = guard.start();
    assert.equal(second, null, 'a reload triggered while one is already sounding must not layer another');
  });

  it('stop() with the matching token clears the active state, allowing a new start()', () => {
    const guard = new SingleVoiceGuard();
    const token = guard.start();
    guard.stop(token as number);
    assert.equal(guard.isActive, false);
    assert.notEqual(guard.start(), null, 'after a matched stop, a new run must be startable');
  });

  it('a stale stop() from a superseded run is a no-op (does not clear a newer, still-active run)', () => {
    const guard = new SingleVoiceGuard();
    const staleToken = guard.start();
    assert.notEqual(staleToken, null);
    guard.stop(staleToken as number);
    assert.equal(guard.isActive, false);
    const freshToken = guard.start();
    assert.notEqual(freshToken, null);
    // The stale token from the FIRST run must not be able to stop the SECOND, still-active run.
    guard.stop(staleToken as number);
    assert.equal(guard.isActive, true, 'a stale token from a prior run must not clear a newer active run');
  });

  it('tokens are unique across successive runs', () => {
    const guard = new SingleVoiceGuard();
    const t1 = guard.start();
    guard.stop(t1 as number);
    const t2 = guard.start();
    assert.notEqual(t1, t2);
  });

  it('forceRelease() clears an active run regardless of token, allowing an immediate new start() -- dev-only reset path', () => {
    const guard = new SingleVoiceGuard();
    guard.start();
    assert.equal(guard.isActive, true);
    guard.forceRelease();
    assert.equal(guard.isActive, false);
    assert.notEqual(guard.start(), null);
  });
});
