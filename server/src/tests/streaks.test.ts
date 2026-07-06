import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MULTIKILL_WINDOW_MS } from '../../../shared/match';
import { createStreakState, recordKill, resetOnDeath } from '../game/streaks';
import { HEAD, HITBOX, resolvePlayerHit } from '../game/combat';
import type { Vec3 } from '../../../shared/protocol';

describe('streaks', () => {
  it('announces exact tiers only', () => {
    const state = createStreakState();
    const tiers: Array<number | null> = [];
    for (let kill = 1; kill <= 9; kill++) {
      tiers.push(recordKill(state, kill * (MULTIKILL_WINDOW_MS + 1000)).streakTier);
    }
    assert.deepEqual(tiers, [null, null, 3, null, 5, null, null, 8, null]);
  });

  it('chains multikills inside the window and resets outside it', () => {
    const state = createStreakState();
    assert.equal(recordKill(state, 1000).multikill, null);
    assert.equal(recordKill(state, 2000).multikill, 2);
    assert.equal(recordKill(state, 3000).multikill, 3);
    assert.equal(recordKill(state, 3000 + MULTIKILL_WINDOW_MS + 1).multikill, null);
  });

  it('caps multikill announcements at 4', () => {
    const state = createStreakState();
    for (let i = 0; i < 6; i++) recordKill(state, 1000 + i);
    assert.equal(recordKill(state, 1010).multikill, 4);
  });

  it('tracks best streak across deaths', () => {
    const state = createStreakState();
    for (let i = 0; i < 6; i++) recordKill(state, (i + 1) * 10000);
    assert.equal(resetOnDeath(state), 6);
    assert.equal(state.streak, 0);
    assert.equal(state.bestStreak, 6);
    recordKill(state, 100000);
    assert.equal(state.bestStreak, 6);
  });
});

describe('two-zone hit resolution', () => {
  const ORIGIN: Vec3 = [0, 0, 0];
  const FORWARD: Vec3 = [0, 0, -1];

  it('reports a headshot when aiming at head height', () => {
    // Target center at eye level - head sits OFFSET_Y above its center.
    const center: Vec3 = [0, -HEAD.OFFSET_Y, -10];
    const hit = resolvePlayerHit(ORIGIN, FORWARD, 100, center);
    assert.ok(hit && hit.headshot, 'expected a headshot');
  });

  it('reports a body shot at torso height', () => {
    const center: Vec3 = [0, 0, -10];
    const hit = resolvePlayerHit(ORIGIN, FORWARD, 100, center);
    assert.ok(hit && !hit.headshot, 'expected a body hit');
  });

  it('misses cleanly past the whole player', () => {
    const center: Vec3 = [HITBOX.RADIUS + HEAD.RADIUS + 1.5, 0, -10];
    assert.equal(resolvePlayerHit(ORIGIN, FORWARD, 100, center), null);
  });
});
