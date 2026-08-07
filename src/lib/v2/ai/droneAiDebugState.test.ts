import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDroneAiDebugDroneSnapshot,
  createDroneAiDebugDroneSnapshot,
  createDroneAiDebugRuntime,
  formatDroneAiDebugNumber,
  listDroneAiDebugDrones,
  noteDroneAiDebugStateChange,
  normalizeFiniteDisplayNumber,
  registerDroneAiDebugDrone,
  reregisterDroneAiDebugRoster,
  resetDroneAiDebugRuntime,
  resetDroneAiDebugSquadMeta,
  unregisterDroneAiDebugDrone,
} from './droneAiDebugState';

describe('droneAiDebugState — runtime ownership', () => {
  it('createDroneAiDebugRuntime returns a canonical empty runtime', () => {
    const runtime = createDroneAiDebugRuntime(1, 1000);
    assert.strictEqual(runtime.sessionId, 1);
    assert.strictEqual(runtime.drones.size, 0);
    assert.strictEqual(runtime.squad.mountedDroneCount, 0);
    assert.strictEqual(runtime.squad.activeLeaseCount, 0);
  });

  it('two independently-created runtimes get distinct session tokens when seeded distinctly', () => {
    const a = createDroneAiDebugRuntime(1000, 0);
    const b = createDroneAiDebugRuntime(2000, 0);
    assert.notStrictEqual(a.sessionId, b.sessionId);
  });

  it('registration creates exactly one record', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    assert.strictEqual(runtime.drones.size, 1);
    assert.ok(runtime.drones.has('drone-a'));
  });

  it('duplicate registration does not duplicate — returns the SAME existing record', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const first = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    first.fireCount = 3; // mutate to prove identity, not just equal shape
    const second = registerDroneAiDebugDrone(runtime, 'drone-a', 1000);
    assert.strictEqual(runtime.drones.size, 1);
    assert.strictEqual(second, first, 'duplicate registration must return the exact same object, never a fresh one');
    assert.strictEqual(second.fireCount, 3, 'duplicate registration must not reset an existing record');
  });

  it('update replaces the current snapshot rather than appending history — no array growth on repeated writes', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    for (let i = 0; i < 50; i++) {
      record.decisionTickCount += 1;
      record.tacticalPosition.x = i;
    }
    assert.strictEqual(runtime.drones.size, 1);
    assert.strictEqual(record.decisionTickCount, 50);
    assert.strictEqual(record.tacticalPosition.x, 49);
  });

  it('unregister removes the record', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    unregisterDroneAiDebugDrone(runtime, 'drone-a');
    assert.strictEqual(runtime.drones.size, 0);
    assert.ok(!runtime.drones.has('drone-a'));
  });

  it('reset removes all records and restores fresh squad meta', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    registerDroneAiDebugDrone(runtime, 'drone-b', 0);
    runtime.squad.activeLeaseCount = 4;
    resetDroneAiDebugRuntime(runtime, 500);
    assert.strictEqual(runtime.drones.size, 0);
    assert.strictEqual(runtime.squad.activeLeaseCount, 0);
    assert.strictEqual(runtime.squad.lastUpdatedAtMs, 500);
  });

  it('removed drone leaves no stale data after unregister', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    record.hasAttackLease = true;
    record.recoveryPhase = 'nudging';
    unregisterDroneAiDebugDrone(runtime, 'drone-a');
    assert.deepStrictEqual(listDroneAiDebugDrones(runtime), [], 'no trace of the removed drone should remain in the listed roster');
  });

  it('stable ID sort — listDroneAiDebugDrones never depends on registration order', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    registerDroneAiDebugDrone(runtime, 'drone-c', 0);
    registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    registerDroneAiDebugDrone(runtime, 'drone-b', 0);
    const ids = listDroneAiDebugDrones(runtime).map((d) => d.id);
    assert.deepStrictEqual(ids, ['drone-a', 'drone-b', 'drone-c']);
  });

  it('finite normalization — NaN/Infinity/-Infinity collapse to the fallback, ordinary numbers pass through', () => {
    assert.strictEqual(normalizeFiniteDisplayNumber(NaN, -1), -1);
    assert.strictEqual(normalizeFiniteDisplayNumber(Infinity, -1), -1);
    assert.strictEqual(normalizeFiniteDisplayNumber(-Infinity, -1), -1);
    assert.strictEqual(normalizeFiniteDisplayNumber(null, -1), -1);
    assert.strictEqual(normalizeFiniteDisplayNumber(undefined, -1), -1);
    assert.strictEqual(normalizeFiniteDisplayNumber(4.5, -1), 4.5);
    assert.strictEqual(normalizeFiniteDisplayNumber(0, -1), 0);
  });

  it('input objects are not mutated by registration — a caller-owned id string is never wrapped/aliased into something the caller can accidentally corrupt', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const ids = ['drone-a', 'drone-b'];
    const idsCopy = [...ids];
    reregisterDroneAiDebugRoster(runtime, ids, 0);
    assert.deepStrictEqual(ids, idsCopy, 'the caller-supplied id array must be left untouched');
  });
});

describe('droneAiDebugState — lifecycle', () => {
  it('five resets in a row leave the runtime empty every time', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    for (let i = 0; i < 5; i++) {
      registerDroneAiDebugDrone(runtime, `drone-${i}`, i * 10);
      resetDroneAiDebugRuntime(runtime, i * 10);
      assert.strictEqual(runtime.drones.size, 0, `reset #${i + 1} must leave zero records`);
    }
  });

  it('five independently-constructed runtimes ("remount-equivalent owners") never share state', () => {
    const runtimes = Array.from({ length: 5 }, (_, i) => createDroneAiDebugRuntime(i, 0));
    registerDroneAiDebugDrone(runtimes[0], 'drone-only-in-first', 0);
    for (let i = 1; i < runtimes.length; i++) {
      assert.strictEqual(runtimes[i].drones.size, 0, `runtime ${i} must be fully isolated from runtime 0`);
    }
  });

  it('8 -> 5 -> 8 record count is exact at every step', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const ids8 = Array.from({ length: 8 }, (_, i) => `drone-${i}`);
    const ids5 = ids8.slice(0, 5);
    reregisterDroneAiDebugRoster(runtime, ids8, 0);
    assert.strictEqual(runtime.drones.size, 8);
    reregisterDroneAiDebugRoster(runtime, ids5, 1000);
    assert.strictEqual(runtime.drones.size, 5);
    reregisterDroneAiDebugRoster(runtime, ids8, 2000);
    assert.strictEqual(runtime.drones.size, 8);
    assert.deepStrictEqual(listDroneAiDebugDrones(runtime).map((d) => d.id), ids8);
  });

  it('a roster shrink (8 -> 5) leaves no stale record for a dropped ID', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const ids8 = Array.from({ length: 8 }, (_, i) => `drone-${i}`);
    reregisterDroneAiDebugRoster(runtime, ids8, 0);
    reregisterDroneAiDebugRoster(runtime, ids8.slice(0, 5), 500);
    for (const droppedId of ids8.slice(5)) {
      assert.ok(!runtime.drones.has(droppedId), `${droppedId} must not survive the roster shrink`);
    }
  });

  it('a full roster rebuild ("player generation clears generation-specific display data") produces fresh, default-valued records, never carrying over stale lease/recovery/memory fields', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const [record] = reregisterDroneAiDebugRoster(runtime, ['drone-a'], 0);
    record.hasAttackLease = true;
    record.recoveryPhase = 'teleport-fallback';
    record.lastKnownPosition = { x: 1, y: 2, z: 3 };
    const [fresh] = reregisterDroneAiDebugRoster(runtime, ['drone-a'], 1000);
    assert.strictEqual(fresh.hasAttackLease, false, 'no stale lease');
    assert.strictEqual(fresh.recoveryPhase, 'idle', 'no stale recovery phase');
    assert.strictEqual(fresh.lastKnownPosition, null, 'no stale memory');
  });

  it('a restart-only clear (same roster, clearDroneAiDebugDroneSnapshot) preserves object identity while clearing every field to fresh defaults', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    record.hasAttackLease = true;
    record.fireCount = 7;
    record.sectorIndex = 3;
    clearDroneAiDebugDroneSnapshot(record, 5000);
    assert.strictEqual(runtime.drones.get('drone-a'), record, 'restart must not replace the object identity — a caller-held array reference must remain valid');
    assert.strictEqual(record.hasAttackLease, false);
    assert.strictEqual(record.fireCount, 0);
    assert.strictEqual(record.sectorIndex, null);
    assert.strictEqual(record.stateEnteredAtMs, 5000);
  });

  it('resetDroneAiDebugSquadMeta clears squad-level counters without touching the drones map', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    runtime.squad.activeLeaseCount = 4;
    runtime.squad.simulationSubsteps = 900;
    resetDroneAiDebugSquadMeta(runtime, 9000);
    assert.strictEqual(runtime.squad.activeLeaseCount, 0);
    assert.strictEqual(runtime.squad.simulationSubsteps, 0);
    assert.strictEqual(runtime.drones.size, 1, 'drones map must be untouched by a squad-meta-only reset');
  });

  it('no stale helper record — a record cleared by restart never reports a prior life\'s telegraph phase', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    record.telegraphPhase = 'fire';
    clearDroneAiDebugDroneSnapshot(record, 100);
    assert.strictEqual(record.telegraphPhase, 'idle');
  });
});

describe('droneAiDebugState — presentation', () => {
  it('deterministic row ordering is stable across repeated calls', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    reregisterDroneAiDebugRoster(runtime, ['drone-z', 'drone-a', 'drone-m'], 0);
    const first = listDroneAiDebugDrones(runtime).map((d) => d.id);
    const second = listDroneAiDebugDrones(runtime).map((d) => d.id);
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(first, ['drone-a', 'drone-m', 'drone-z']);
  });

  it('nullable values format safely without throwing', () => {
    assert.strictEqual(formatDroneAiDebugNumber(null), '—');
    assert.strictEqual(formatDroneAiDebugNumber(undefined), '—');
  });

  it('NaN/Infinity never render as literal "NaN"/"Infinity" strings', () => {
    assert.strictEqual(formatDroneAiDebugNumber(NaN), '—');
    assert.strictEqual(formatDroneAiDebugNumber(Infinity), '—');
    assert.strictEqual(formatDroneAiDebugNumber(-Infinity), '—');
  });

  it('display rounding does not mutate the source value', () => {
    const source = 1.23456789;
    const formatted = formatDroneAiDebugNumber(source, 2);
    assert.strictEqual(formatted, '1.23');
    assert.strictEqual(source, 1.23456789, 'formatting must never mutate the original number binding');
  });

  it('an ordinary finite value formats with the requested precision', () => {
    assert.strictEqual(formatDroneAiDebugNumber(3, 2), '3.00');
    assert.strictEqual(formatDroneAiDebugNumber(-0.5, 1), '-0.5');
  });

  it('labels every one of the six real runtime states plus an unknown-value fallback without throwing', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    const knownStates = ['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed'];
    for (const state of knownStates) {
      noteDroneAiDebugStateChange(record, state, 0, null);
      assert.strictEqual(record.runtimeState, state);
    }
    // An unrecognized value must still be stored/displayed safely, never throw.
    assert.doesNotThrow(() => noteDroneAiDebugStateChange(record, 'some-unexpected-value', 0, null));
    assert.strictEqual(record.runtimeState, 'some-unexpected-value');
  });
});

describe('droneAiDebugState — state-transition bookkeeping', () => {
  it('a genuine state change stamps a new stateEnteredAtMs and stores the given reason', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    noteDroneAiDebugStateChange(record, 'engaging', 1000, 'acquired target');
    assert.strictEqual(record.runtimeState, 'engaging');
    assert.strictEqual(record.stateEnteredAtMs, 1000);
    assert.strictEqual(record.lastTransitionReason, 'acquired target');
    assert.strictEqual(record.timeInStateMs, 0);
  });

  it('an unchanged state only advances timeInStateMs, never re-stamps stateEnteredAtMs or the reason', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    noteDroneAiDebugStateChange(record, 'engaging', 1000, 'acquired target');
    noteDroneAiDebugStateChange(record, 'engaging', 1500, null);
    assert.strictEqual(record.stateEnteredAtMs, 1000, 'stateEnteredAtMs must not move while the state itself is unchanged');
    assert.strictEqual(record.lastTransitionReason, 'acquired target', 'an unchanged-state tick must not overwrite the last real transition reason');
    assert.strictEqual(record.timeInStateMs, 500);
  });

  it('timeInStateMs never goes negative even if nowMs is passed out of order', () => {
    const runtime = createDroneAiDebugRuntime(1, 0);
    const record = registerDroneAiDebugDrone(runtime, 'drone-a', 0);
    noteDroneAiDebugStateChange(record, 'engaging', 1000, 'acquired target');
    noteDroneAiDebugStateChange(record, 'engaging', 500, null);
    assert.strictEqual(record.timeInStateMs, 0, 'a clock-reversal must clamp to zero, never go negative');
  });
});

describe('droneAiDebugState — createDroneAiDebugDroneSnapshot defaults', () => {
  it('a freshly created record has every optional field at a safe, non-throwing default', () => {
    const record = createDroneAiDebugDroneSnapshot('drone-a', 42);
    assert.strictEqual(record.id, 'drone-a');
    assert.strictEqual(record.runtimeState, 'spawning');
    assert.strictEqual(record.lastKnownPosition, null);
    assert.strictEqual(record.memoryRemainingMs, null);
    assert.strictEqual(record.reactionRemainingMs, null);
    assert.strictEqual(record.detectorProgressRatio, null);
    assert.strictEqual(record.sectorIndex, null);
    assert.strictEqual(record.windupRemainingMs, null);
    assert.strictEqual(record.cooldownRemainingMs, null);
    assert.strictEqual(record.hasAttackLease, false);
    assert.strictEqual(record.coordinationBlocked, false);
    assert.deepStrictEqual(record.tacticalPosition, { x: 0, y: 0, z: 0 });
    assert.deepStrictEqual(record.finalMovement, { x: 0, y: 0, z: 0 });
  });

  it('two freshly created records never share the same vector sub-object identity', () => {
    const a = createDroneAiDebugDroneSnapshot('drone-a', 0);
    const b = createDroneAiDebugDroneSnapshot('drone-b', 0);
    assert.notStrictEqual(a.tacticalPosition, b.tacticalPosition);
    a.tacticalPosition.x = 99;
    assert.strictEqual(b.tacticalPosition.x, 0, 'mutating one record\'s vector must never leak into another\'s');
  });
});
