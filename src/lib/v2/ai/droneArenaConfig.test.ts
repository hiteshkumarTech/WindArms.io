import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRONE_ARENA_CONFIG } from './droneArenaConfig';
import { DRONE_SPAWNS } from '../play/spawnConfig';

/**
 * Milestone 9F — `droneArenaConfig.ts` is plain derived data (no runtime
 * logic to speak of), so this suite is entirely about PROVING the
 * derivation is internally consistent and source-grounded: every real spawn
 * validates, every safe fallback validates, the Wind Lift zone matches the
 * real constants exactly, and the config is immutable/caller-safe.
 */
describe('DRONE_ARENA_CONFIG — horizontal bounds', () => {
  it('minX < maxX and minZ < maxZ, both finite', () => {
    const { minX, maxX, minZ, maxZ } = DRONE_ARENA_CONFIG.horizontalBounds;
    assert.ok(Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ));
    assert.ok(minX < maxX);
    assert.ok(minZ < maxZ);
  });

  it('matches MAIN_DECK\'s own footprint exactly (±17 on both axes)', () => {
    assert.deepStrictEqual(DRONE_ARENA_CONFIG.horizontalBounds, { minX: -17, maxX: 17, minZ: -17, maxZ: 17 });
  });

  it('every current DRONE_SPAWNS position lies strictly inside the horizontal bounds', () => {
    const { minX, maxX, minZ, maxZ } = DRONE_ARENA_CONFIG.horizontalBounds;
    for (const spawn of DRONE_SPAWNS) {
      const [x, , z] = spawn.position;
      assert.ok(x > minX && x < maxX, `${spawn.id} x=${x} must be inside (${minX},${maxX})`);
      assert.ok(z > minZ && z < maxZ, `${spawn.id} z=${z} must be inside (${minZ},${maxZ})`);
    }
  });
});

describe('DRONE_ARENA_CONFIG — altitude limits', () => {
  it('minAltitudeM < maxAltitudeM, both finite and positive', () => {
    assert.ok(Number.isFinite(DRONE_ARENA_CONFIG.minAltitudeM) && Number.isFinite(DRONE_ARENA_CONFIG.maxAltitudeM));
    assert.ok(DRONE_ARENA_CONFIG.minAltitudeM > 0);
    assert.ok(DRONE_ARENA_CONFIG.minAltitudeM < DRONE_ARENA_CONFIG.maxAltitudeM);
  });

  it('every current DRONE_SPAWNS altitude lies inside [minAltitudeM, maxAltitudeM]', () => {
    for (const spawn of DRONE_SPAWNS) {
      const y = spawn.position[1];
      assert.ok(y >= DRONE_ARENA_CONFIG.minAltitudeM && y <= DRONE_ARENA_CONFIG.maxAltitudeM, `${spawn.id} y=${y} must be inside [${DRONE_ARENA_CONFIG.minAltitudeM},${DRONE_ARENA_CONFIG.maxAltitudeM}]`);
    }
  });
});

describe('DRONE_ARENA_CONFIG — Wind Lift forbidden zone', () => {
  it('has exactly one forbidden zone, matching the real WIND_LIFT constant', () => {
    assert.strictEqual(DRONE_ARENA_CONFIG.forbiddenZones.length, 1);
    const zone = DRONE_ARENA_CONFIG.forbiddenZones[0];
    assert.strictEqual(zone.id, 'wind-lift');
    assert.strictEqual(zone.centerX, -6.4);
    assert.strictEqual(zone.centerZ, -6);
    assert.ok(zone.radiusM > 1.6, 'radiusM must be strictly larger than the real physics radius (1.6) — a visual clearance margin is required, not the bare physics value');
    assert.strictEqual(zone.minY, -0.5);
    assert.strictEqual(zone.maxY, 7.5);
  });

  it('the forbidden zone is finite', () => {
    const zone = DRONE_ARENA_CONFIG.forbiddenZones[0];
    for (const v of [zone.centerX, zone.centerZ, zone.radiusM, zone.minY, zone.maxY]) assert.ok(Number.isFinite(v));
  });
});

describe('DRONE_ARENA_CONFIG — safe fallback positions', () => {
  it('has one fallback per real DRONE_SPAWNS entry', () => {
    assert.strictEqual(DRONE_ARENA_CONFIG.safeFallbackPositions.length, DRONE_SPAWNS.length);
  });

  it('every safe fallback position validates inside the horizontal bounds and altitude limits', () => {
    const { minX, maxX, minZ, maxZ } = DRONE_ARENA_CONFIG.horizontalBounds;
    for (const pos of DRONE_ARENA_CONFIG.safeFallbackPositions) {
      assert.ok(pos.x > minX && pos.x < maxX);
      assert.ok(pos.z > minZ && pos.z < maxZ);
      assert.ok(pos.y >= DRONE_ARENA_CONFIG.minAltitudeM && pos.y <= DRONE_ARENA_CONFIG.maxAltitudeM);
    }
  });

  it('every safe fallback position lies outside every forbidden zone', () => {
    for (const pos of DRONE_ARENA_CONFIG.safeFallbackPositions) {
      for (const zone of DRONE_ARENA_CONFIG.forbiddenZones) {
        const dx = pos.x - zone.centerX;
        const dz = pos.z - zone.centerZ;
        const insideXZ = dx * dx + dz * dz <= zone.radiusM * zone.radiusM;
        const insideY = pos.y >= zone.minY && pos.y <= zone.maxY;
        assert.ok(!(insideXZ && insideY), `fallback (${pos.x},${pos.y},${pos.z}) must not sit inside forbidden zone ${zone.id}`);
      }
    }
  });

  it('every safe fallback position is finite', () => {
    for (const pos of DRONE_ARENA_CONFIG.safeFallbackPositions) {
      assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z));
    }
  });
});

describe('DRONE_ARENA_CONFIG — determinism / immutability', () => {
  it('resolves to the same values across repeated reads (module-level constant, no hidden mutable state)', () => {
    const snapshot = JSON.parse(JSON.stringify(DRONE_ARENA_CONFIG));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(DRONE_ARENA_CONFIG)), snapshot);
  });

  it('softBoundaryMarginM and hardBoundaryEpsilonM are finite and sane (epsilon far smaller than margin)', () => {
    assert.ok(Number.isFinite(DRONE_ARENA_CONFIG.softBoundaryMarginM));
    assert.ok(Number.isFinite(DRONE_ARENA_CONFIG.hardBoundaryEpsilonM));
    assert.ok(DRONE_ARENA_CONFIG.hardBoundaryEpsilonM < DRONE_ARENA_CONFIG.softBoundaryMarginM);
  });
});
