import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerInputPacket, Vec3 } from '../../../shared/protocol';
import {
  isWellFormedFire,
  isWellFormedInput,
  sanitizeChatText,
  sanitizeName,
  validateMovement,
  type ValidationContext,
} from '../game/validation';

function packet(overrides: Partial<PlayerInputPacket> = {}): PlayerInputPacket {
  return {
    seq: 1,
    position: [0, 3, 0],
    yaw: 0,
    pitch: 0,
    state: 'run',
    weapon: 'ar',
    ...overrides,
  };
}

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    lastPosition: [0, 3, 0] as Vec3,
    lastInputAt: Date.now() - 33,
    lastSeq: 0,
    ...overrides,
  };
}

describe('isWellFormedInput', () => {
  it('accepts a valid packet', () => {
    assert.ok(isWellFormedInput(packet()));
  });

  it('rejects structural garbage', () => {
    assert.equal(isWellFormedInput(null), false);
    assert.equal(isWellFormedInput({}), false);
    assert.equal(isWellFormedInput(packet({ position: [0, NaN, 0] as Vec3 })), false);
    assert.equal(isWellFormedInput({ ...packet(), state: 'flying' }), false);
    assert.equal(isWellFormedInput({ ...packet(), weapon: 'bfg9000' }), false);
  });
});

describe('isWellFormedFire', () => {
  const fire = { seq: 1, weapon: 'ar' as const, origin: [0, 1, 0] as Vec3, directions: [[0, 0, -1]] as Vec3[] };

  it('accepts a valid fire packet', () => {
    assert.ok(isWellFormedFire(fire));
  });

  it('rejects empty or oversized pellet arrays', () => {
    assert.equal(isWellFormedFire({ ...fire, directions: [] }), false);
    assert.equal(isWellFormedFire({ ...fire, directions: Array(13).fill([0, 0, -1]) }), false);
  });
});

describe('validateMovement', () => {
  it('accepts a plausible step', () => {
    const verdict = validateMovement(packet({ position: [0.2, 3, -0.2] }), context(), Date.now());
    assert.ok(verdict.ok);
  });

  it('rejects teleports and returns the last good position', () => {
    const verdict = validateMovement(packet({ position: [25, 3, 0] }), context(), Date.now());
    assert.ok(!verdict.ok);
    if (!verdict.ok) assert.deepEqual(verdict.correctedPosition, [0, 3, 0]);
  });

  it('rejects out-of-bounds positions', () => {
    const verdict = validateMovement(packet({ position: [999, 3, 0] }), context(), Date.now());
    assert.ok(!verdict.ok);
  });

  it('rejects stale sequence numbers', () => {
    const verdict = validateMovement(packet({ seq: 0 }), context({ lastSeq: 5 }), Date.now());
    assert.ok(!verdict.ok);
  });
});

describe('sanitizers', () => {
  it('falls back to Recruit for hostile names', () => {
    assert.equal(sanitizeName(42), 'Recruit');
    assert.equal(sanitizeName('<script>'), 'script');
    assert.equal(sanitizeName('x'), 'Recruit');
    assert.ok(sanitizeName('A'.repeat(64)).length <= 16);
  });

  it('caps and cleans chat text', () => {
    assert.equal(sanitizeChatText(123), '');
    assert.equal(sanitizeChatText('hello'), 'hello');
    assert.ok(sanitizeChatText('x'.repeat(500)).length <= 120);
  });
});
