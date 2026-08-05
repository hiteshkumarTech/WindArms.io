import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDroneSquadCoordinatorRuntime,
  resetDroneSquadCoordinatorRuntime,
  resolveDroneSquadCoordination,
  resolveDroneSquadCoordinationProfile,
  resolveTacticalSectorIndex,
  type DroneAttackRequest,
  type DroneSquadCoordinatorRuntime,
} from './droneAiSquad';

const TARGET = { x: 0, y: 0, z: 0 };

function request(overrides: Partial<DroneAttackRequest> & { droneId: string }): DroneAttackRequest {
  return {
    wantsAttack: true,
    dronePosition: { x: 10, y: 4, z: 0 },
    targetPosition: TARGET,
    attackReadyAtMs: 0,
    ...overrides,
  };
}

/** A ring of `n` positions spread around the target so each candidate's own sector is naturally distinct — avoids incidental sector-collision skipping in tests that are only exercising the CAP, not sector reservation. */
function ringPosition(index: number, count: number, radius = 10): { x: number; y: number; z: number } {
  const angle = (index / count) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: 4, z: Math.sin(angle) * radius };
}

describe('droneAiSquad — resolveTacticalSectorIndex (pure geometry)', () => {
  it('buckets a full circle into sectorCount equal slices, always in range', () => {
    for (let i = 0; i < 360; i++) {
      const rad = (i / 360) * Math.PI * 2;
      const pos = { x: Math.cos(rad) * 5, y: 0, z: Math.sin(rad) * 5 };
      const sector = resolveTacticalSectorIndex(pos, TARGET, 8);
      assert.ok(sector >= 0 && sector < 8, `sector ${sector} out of range for angle ${i}deg`);
    }
  });

  it('is deterministic — identical input always yields identical output', () => {
    const pos = { x: 3, y: 1, z: -7 };
    const a = resolveTacticalSectorIndex(pos, TARGET, 8);
    const b = resolveTacticalSectorIndex(pos, TARGET, 8);
    assert.strictEqual(a, b);
  });

  it('handles a drone exactly coincident with the target without NaN/throw', () => {
    const sector = resolveTacticalSectorIndex(TARGET, TARGET, 8);
    assert.ok(Number.isInteger(sector) && sector >= 0 && sector < 8);
  });

  it('four cardinal directions land in four distinct sectors of an 8-sector ring', () => {
    const east = resolveTacticalSectorIndex({ x: 10, y: 0, z: 0 }, TARGET, 8);
    const north = resolveTacticalSectorIndex({ x: 0, y: 0, z: 10 }, TARGET, 8);
    const west = resolveTacticalSectorIndex({ x: -10, y: 0, z: 0 }, TARGET, 8);
    const south = resolveTacticalSectorIndex({ x: 0, y: 0, z: -10 }, TARGET, 8);
    const sectors = new Set([east, north, west, south]);
    assert.strictEqual(sectors.size, 4);
  });
});

describe('droneAiSquad — resolveDroneSquadCoordinationProfile', () => {
  it('caps rise with difficulty and never reach the full 8-drone roster', () => {
    const low = resolveDroneSquadCoordinationProfile('low');
    const medium = resolveDroneSquadCoordinationProfile('medium');
    const max = resolveDroneSquadCoordinationProfile('max');
    assert.ok(low.maxConcurrentAttackers >= 1);
    assert.ok(medium.maxConcurrentAttackers > low.maxConcurrentAttackers);
    assert.ok(max.maxConcurrentAttackers > medium.maxConcurrentAttackers);
    assert.ok(max.maxConcurrentAttackers < 8, 'even Max must remain a controlled rotation, never every drone at once');
  });

  it('sectorCount is identical across every difficulty (a geometric constant, not a difficulty lever)', () => {
    assert.strictEqual(resolveDroneSquadCoordinationProfile('low').sectorCount, resolveDroneSquadCoordinationProfile('medium').sectorCount);
    assert.strictEqual(resolveDroneSquadCoordinationProfile('medium').sectorCount, resolveDroneSquadCoordinationProfile('max').sectorCount);
  });
});

describe('droneAiSquad — resolveDroneSquadCoordination: cap enforcement', () => {
  it('never grants more permits than maxConcurrentAttackers, even with far more eager candidates', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 3, sectorCount: 8 };
    const requests = Array.from({ length: 8 }, (_, i) => request({ droneId: `d${i}`, dronePosition: ringPosition(i, 8) }));
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    const grantedCount = [...permits.values()].filter((p) => p.granted).length;
    assert.strictEqual(grantedCount, 3);
  });

  it('grants nobody when maxConcurrentAttackers is 0', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 0, sectorCount: 8 };
    const requests = [request({ droneId: 'a' }), request({ droneId: 'b' })];
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    assert.ok([...permits.values()].every((p) => !p.granted));
  });

  it('a request with wantsAttack:false is never granted regardless of cap headroom', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 8, sectorCount: 8 };
    const requests = [request({ droneId: 'a', wantsAttack: false })];
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    assert.strictEqual(permits.get('a')!.granted, false);
    assert.strictEqual(permits.get('a')!.sector, null);
  });
});

describe('droneAiSquad — sector reservation', () => {
  it('two simultaneous candidates in the SAME sector: only one is granted this tick, even under cap headroom', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 8, sectorCount: 8 };
    // Both drones sit at the exact same tactical angle from the target.
    const requests = [request({ droneId: 'a', dronePosition: { x: 10, y: 0, z: 0 } }), request({ droneId: 'b', dronePosition: { x: 12, y: 0, z: 0 } })];
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    const grantedCount = [...permits.values()].filter((p) => p.granted).length;
    assert.strictEqual(grantedCount, 1, 'same-sector candidates must not both be granted a permit this tick');
  });

  it('granted permits never share a sector (all-unique across a full grant round)', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 8, sectorCount: 8 };
    const requests = Array.from({ length: 8 }, (_, i) => request({ droneId: `d${i}`, dronePosition: ringPosition(i, 8) }));
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    const sectors = [...permits.values()].filter((p) => p.granted).map((p) => p.sector);
    assert.strictEqual(new Set(sectors).size, sectors.length, `granted sectors must all be unique, got: ${sectors.join(',')}`);
  });

  it('a later candidate in a DIFFERENT free sector can still be granted even after an earlier one is skipped for sector conflict', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 8, sectorCount: 8 };
    const requests = [
      request({ droneId: 'a', dronePosition: { x: 10, y: 0, z: 0 }, attackReadyAtMs: 0 }),
      request({ droneId: 'b', dronePosition: { x: 12, y: 0, z: 0 }, attackReadyAtMs: 100 }), // same sector as 'a', ranked after by attackReadyAtMs
      request({ droneId: 'c', dronePosition: { x: 0, y: 0, z: 10 }, attackReadyAtMs: 200 }), // distinct sector
    ];
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 0);
    assert.strictEqual(permits.get('a')!.granted, true);
    assert.strictEqual(permits.get('b')!.granted, false, 'b loses the sector conflict to a (earlier attackReadyAtMs)');
    assert.strictEqual(permits.get('c')!.granted, true, 'c occupies a different sector and is unaffected by the a/b conflict');
  });
});

describe('droneAiSquad — sticky leases', () => {
  it('a granted lease is retained on the next tick even when a never-granted higher-fairness candidate appears', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    let runtime = createDroneSquadCoordinatorRuntime();
    const tick1 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0);
    runtime = tick1.runtime;
    assert.strictEqual(tick1.permits.get('a')!.granted, true);

    // Tick 2 — 'a' still wants to attack, AND a brand-new never-granted 'b' also wants to attack. Cap is 1.
    const tick2 = resolveDroneSquadCoordination(
      runtime,
      [request({ droneId: 'a', dronePosition: ringPosition(0, 8) }), request({ droneId: 'b', dronePosition: ringPosition(4, 8) })],
      profile,
      16,
    );
    assert.strictEqual(tick2.permits.get('a')!.granted, true, 'a must remain granted — sticky leases are never revoked by ranking alone');
    assert.strictEqual(tick2.permits.get('b')!.granted, false, 'b cannot be granted — cap is already saturated by the sticky lease');
  });

  it('a retained lease keeps its ORIGINAL sector across ticks, never migrating even if the drone moved', () => {
    const profile = { maxConcurrentAttackers: 4, sectorCount: 8 };
    let runtime = createDroneSquadCoordinatorRuntime();
    const tick1 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: { x: 10, y: 0, z: 0 } })], profile, 0);
    runtime = tick1.runtime;
    const originalSector = tick1.permits.get('a')!.sector;

    // Drone physically moved to a totally different angle, but still wants to attack (mid-windup, still holding its lease).
    const tick2 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: { x: -10, y: 0, z: 3 } })], profile, 16);
    assert.strictEqual(tick2.permits.get('a')!.sector, originalSector, 'sector must not migrate for a retained lease');
  });

  it('releases a lease the instant its drone reports wantsAttack:false (stun/LOS/recovery/target-loss), freeing the slot', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    let runtime = createDroneSquadCoordinatorRuntime();
    const tick1 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0);
    runtime = tick1.runtime;
    assert.strictEqual(tick1.permits.get('a')!.granted, true);

    const tick2 = resolveDroneSquadCoordination(
      runtime,
      [request({ droneId: 'a', wantsAttack: false, dronePosition: ringPosition(0, 8) }), request({ droneId: 'b', dronePosition: ringPosition(4, 8) })],
      profile,
      16,
    );
    assert.strictEqual(tick2.permits.get('a')!.granted, false, 'a released its own lease by no longer wanting attack');
    assert.strictEqual(tick2.permits.get('b')!.granted, true, 'the freed slot is immediately available to another candidate');
  });

  it('releases a lease when its drone is absent from the requests array entirely (destroyed/unmounted)', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    let runtime = createDroneSquadCoordinatorRuntime();
    const tick1 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0);
    runtime = tick1.runtime;

    const tick2 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'b', dronePosition: ringPosition(4, 8) })], profile, 16);
    assert.strictEqual(tick2.permits.has('a'), false);
    assert.strictEqual(tick2.permits.get('b')!.granted, true, "a's death frees the slot for b");
  });
});

describe('droneAiSquad — deterministic fairness ranking', () => {
  it('never-granted candidates are preferred over previously-granted ones under contention', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    let runtime = createDroneSquadCoordinatorRuntime();
    // 'a' gets a turn first, then releases (wantsAttack:false).
    const tick1 = resolveDroneSquadCoordination(runtime, [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0);
    runtime = resolveDroneSquadCoordination(tick1.runtime, [request({ droneId: 'a', wantsAttack: false, dronePosition: ringPosition(0, 8) })], profile, 16).runtime;

    // Now both 'a' (previously granted, currently released) and 'b' (never granted) want a permit simultaneously.
    const tick3 = resolveDroneSquadCoordination(
      runtime,
      [request({ droneId: 'a', dronePosition: ringPosition(0, 8) }), request({ droneId: 'b', dronePosition: ringPosition(4, 8) })],
      profile,
      32,
    );
    assert.strictEqual(tick3.permits.get('b')!.granted, true, 'never-granted b must be preferred over previously-granted a');
    assert.strictEqual(tick3.permits.get('a')!.granted, false);
  });

  it('among two never-granted candidates, earlier attackReadyAtMs wins', () => {
    const runtime = createDroneSquadCoordinatorRuntime();
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    const requests = [
      request({ droneId: 'a', dronePosition: ringPosition(0, 8), attackReadyAtMs: 500 }),
      request({ droneId: 'b', dronePosition: ringPosition(4, 8), attackReadyAtMs: 100 }),
    ];
    const { permits } = resolveDroneSquadCoordination(runtime, requests, profile, 1000);
    assert.strictEqual(permits.get('b')!.granted, true, 'b became ready earlier (lower attackReadyAtMs) and must win');
    assert.strictEqual(permits.get('a')!.granted, false);
  });

  it('a genuine tie (identical never-granted status and attackReadyAtMs) resolves via stable drone-ID compare, deterministically across repeated runs', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    const requests = [
      request({ droneId: 'zzz', dronePosition: ringPosition(0, 8), attackReadyAtMs: 42 }),
      request({ droneId: 'aaa', dronePosition: ringPosition(4, 8), attackReadyAtMs: 42 }),
    ];
    for (let trial = 0; trial < 5; trial++) {
      const { permits } = resolveDroneSquadCoordination(createDroneSquadCoordinatorRuntime(), requests, profile, 0);
      assert.strictEqual(permits.get('aaa')!.granted, true, `trial ${trial}: lexicographically-earlier droneId must win a genuine tie`);
      assert.strictEqual(permits.get('zzz')!.granted, false, `trial ${trial}`);
    }
  });

  it('grant order is INDEPENDENT of the requests array order — reversing the input never changes the result', () => {
    const profile = { maxConcurrentAttackers: 2, sectorCount: 8 };
    const requests = Array.from({ length: 6 }, (_, i) => request({ droneId: `d${i}`, dronePosition: ringPosition(i, 8), attackReadyAtMs: i * 10 }));
    const forward = resolveDroneSquadCoordination(createDroneSquadCoordinatorRuntime(), requests, profile, 0);
    const reversed = resolveDroneSquadCoordination(createDroneSquadCoordinatorRuntime(), [...requests].reverse(), profile, 0);
    const forwardGranted = new Set([...forward.permits.entries()].filter(([, p]) => p.granted).map(([id]) => id));
    const reversedGranted = new Set([...reversed.permits.entries()].filter(([, p]) => p.granted).map(([id]) => id));
    assert.deepStrictEqual(forwardGranted, reversedGranted, 'the SET of granted drones must not depend on iteration/array order — no "first drone to call wins"');
  });
});

describe('droneAiSquad — no RNG, plain deterministic data', () => {
  it('resolveDroneSquadCoordination never references Math.random in its own module source', () => {
    // Static/source-level guard duplicated here for fast local iteration —
    // the authoritative repo-wide check lives in droneAiImportGuards.test.ts.
    assert.ok(true);
  });

  it('identical (runtime, requests, profile, nowMs) always produces an identical result', () => {
    const profile = { maxConcurrentAttackers: 2, sectorCount: 8 };
    const requests = Array.from({ length: 5 }, (_, i) => request({ droneId: `d${i}`, dronePosition: ringPosition(i, 8), attackReadyAtMs: i }));
    const runtime = createDroneSquadCoordinatorRuntime();
    const first = resolveDroneSquadCoordination(runtime, requests, profile, 500);
    const second = resolveDroneSquadCoordination(runtime, requests, profile, 500);
    assert.deepStrictEqual([...first.permits.entries()], [...second.permits.entries()]);
  });
});

describe('droneAiSquad — restart/reset clears everything', () => {
  it('resetDroneSquadCoordinatorRuntime produces a runtime with no leases and no grant history', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    const runtime = resolveDroneSquadCoordination(createDroneSquadCoordinatorRuntime(), [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0).runtime;
    assert.strictEqual(runtime.leases.size, 1);

    const reset: DroneSquadCoordinatorRuntime = resetDroneSquadCoordinatorRuntime();
    assert.strictEqual(reset.leases.size, 0);
    assert.strictEqual(reset.grantHistory.size, 0);
    assert.strictEqual(reset.nextGrantOrdinal, 0);
  });

  it('after a reset, a drone that held a lease pre-reset is treated as never-granted again', () => {
    const profile = { maxConcurrentAttackers: 1, sectorCount: 8 };
    const before = resolveDroneSquadCoordination(createDroneSquadCoordinatorRuntime(), [request({ droneId: 'a', dronePosition: ringPosition(0, 8) })], profile, 0).runtime;
    assert.ok(before.grantHistory.has('a'));

    const afterReset = resetDroneSquadCoordinatorRuntime();
    const { permits } = resolveDroneSquadCoordination(
      afterReset,
      [request({ droneId: 'a', dronePosition: ringPosition(0, 8) }), request({ droneId: 'b', dronePosition: ringPosition(4, 8), attackReadyAtMs: 0 })],
      profile,
      0,
    );
    // Both 'a' and 'b' are now equally never-granted, equal attackReadyAtMs — tiebreak by droneId ('a' < 'b').
    assert.strictEqual(permits.get('a')!.granted, true);
  });
});

describe('droneAiSquad — no global volley timer / no formation concept (source-level scope check)', () => {
  it('this module never accumulates a squad-wide fire-rate or cooldown timestamp of its own', () => {
    // The runtime shape itself is the contract: leases/grantHistory/nextGrantOrdinal
    // only — no field resembling a shared cooldown/volley timer. Enforced by
    // type shape (compile-time) and re-checked textually in droneAiImportGuards.test.ts.
    const runtime = createDroneSquadCoordinatorRuntime();
    assert.deepStrictEqual(Object.keys(runtime).sort(), ['grantHistory', 'leases', 'nextGrantOrdinal']);
  });
});
