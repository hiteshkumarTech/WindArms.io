import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Milestone 9B — source-text regression guards, focused on this one
 * subsystem (per this phase's own "do not build an overly generic
 * repository linter" instruction). Mirrors the established convention this
 * codebase already uses for scoping regressions (see
 * `shadowCasterPolicy.test.ts`'s own route-scoping checks).
 *
 * Milestone 9C extends this file with `droneAiPerception.ts` (still subject
 * to every existing pure-core guard below — it deliberately imports
 * `segmentHitsBox`/`ArenaBox` from `lib/v2/play/spawnConfig.ts`/`types.ts`,
 * neither of which pull in anything forbidden, see that module's own doc
 * comment), plus new guards specific to this phase's own scope fence: no
 * FOV/hearing/squad-awareness modules, no navigation/pathfinding
 * dependency, and unchanged-reference checks for the additional protected
 * files this phase's brief names (`WindLift.tsx`, a representative shadow
 * file) alongside the ones 9B already checked.
 *
 * Milestone 9D extends this file with `droneAiMovementIntent.ts` (also
 * subject to every pure-core guard below — it deliberately imports
 * `DRONE_PERCEPTION_MEMORY` from `droneAiPerception.ts`, an existing
 * intra-package dependency, nothing forbidden), plus new guards specific to
 * THIS phase's own scope fence: no boids-style cohesion/alignment module, no
 * combat-sector/shooter-limit/squad-coordinator module, no arena-boundary
 * implementation, no stuck-recovery implementation, no per-drone `useFrame`
 * (DroneSquad must remain the sole owner even with the new two-pass
 * snapshot update), and `DroneBoltPool.tsx` must remain untouched by the new
 * movement-intent module specifically.
 *
 * Milestone 9E extends this file with `droneAiDifficulty.ts` and
 * `droneAiTelegraph.ts` (both subject to every pure-core guard below —
 * `droneAiDifficulty.ts` deliberately imports `resolveDroneConfig`/
 * `TrialDifficulty` from `lib/v2/play/difficulty.ts` and `DRONE` from
 * `lib/v2/play/enemyConfig.ts`, neither of which pulls in anything
 * forbidden), plus new guards specific to THIS phase's own scope fence: no
 * burst/multi-shot/shooter-limit concept anywhere in the AI package (Rule
 * 3 — still exactly one `DroneBoltPool.spawn()` call per completed attack),
 * `droneAiTelegraph.ts` never imports/couples to `droneAiStateMachine.ts`
 * (Rule 4 — presentation never drives combat truth, enforced structurally:
 * the telegraph module only ever depends on `droneAiTypes.ts`'s plain
 * types), and `DroneBoltPool.tsx`/`VortexFireSystem.tsx` remain untouched by
 * this phase's own new modules specifically.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PURE_CORE_FILES = [
  'src/lib/v2/ai/droneAiTypes.ts',
  'src/lib/v2/ai/droneAiRandom.ts',
  'src/lib/v2/ai/droneAiStateMachine.ts',
  'src/lib/v2/ai/droneAiPerception.ts',
  'src/lib/v2/ai/droneAiMovementIntent.ts',
  'src/lib/v2/ai/droneAiDifficulty.ts',
  'src/lib/v2/ai/droneAiTelegraph.ts',
];

const FORBIDDEN_IMPORTS: Record<string, RegExp> = {
  React: /from ['"]react['"]/,
  R3F: /from ['"]@react-three\/fiber['"]/,
  'Three.js': /from ['"]three['"]/,
  Rapier: /from ['"]@react-three\/rapier['"]/,
  'Zustand/matchStore': /from ['"].*matchStore['"]|from ['"]zustand['"]/,
};

describe('droneAiImportGuards — the pure core has no renderer/framework/store dependency', () => {
  for (const file of PURE_CORE_FILES) {
    for (const [label, pattern] of Object.entries(FORBIDDEN_IMPORTS)) {
      it(`${file} does not import ${label}`, () => {
        const src = read(file);
        assert.ok(!pattern.test(src), `${file} must not import ${label} — it is part of the pure drone AI core`);
      });
    }

    it(`${file} does not call performance.now()`, () => {
      const src = read(file);
      assert.ok(!src.includes('performance.now('), `${file} must receive all timestamps as explicit inputs, never read the clock itself`);
    });

    it(`${file} does not call Math.random()`, () => {
      const src = read(file);
      assert.ok(!src.includes('Math.random('), `${file} must receive all randomness via an injected RandomSource, never call Math.random() itself`);
    });
  }
});

describe('droneAiImportGuards — adapter/lifecycle boundaries', () => {
  it('DroneEnemy.tsx does not create its own useFrame — DroneSquad remains the sole AI/movement frame owner', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(!src.includes('useFrame'), 'DroneEnemy.tsx must stay a pure imperative-handle adapter, driven by DroneSquad\'s one shared frame loop — not its own useFrame');
  });

  it('DroneSquad.tsx remains the only useFrame in the drone system', () => {
    const src = read('src/components/three/play/DroneSquad.tsx');
    assert.ok(src.includes('useFrame'), 'DroneSquad.tsx is expected to keep owning the one shared AI/movement frame loop');
  });

  it('DroneBoltPool.tsx is untouched by the 9B pure-core extraction — no import of any droneAi* module', () => {
    const src = read('src/components/three/play/DroneBoltPool.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'DroneBoltPool.tsx (the protected projectile path) must not reference the new pure AI core at all in 9B');
  });

  it('Milestone 9D — DroneBoltPool.tsx remains untouched by the new movement-intent module specifically', () => {
    const src = read('src/components/three/play/DroneBoltPool.tsx');
    assert.ok(!src.includes('droneAiMovementIntent'), 'DroneBoltPool.tsx must not reference droneAiMovementIntent.ts — its own independent fixed-step ownership is unaffected by 9D');
  });

  it('Milestone 9D — DroneEnemy.tsx exposes writeSpatialSnapshot without creating a second frame owner', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(src.includes('writeSpatialSnapshot'), 'DroneEnemy.tsx must expose the new writeSpatialSnapshot handle method for DroneSquad\'s PASS 1');
    assert.ok(!src.includes('useFrame'), 'writeSpatialSnapshot must still be called FROM DroneSquad\'s one shared frame loop — DroneEnemy must not gain its own useFrame');
  });

  it('Milestone 9D — DroneSquad.tsx\'s fixed-step callback runs two passes (spatial snapshot capture before movement)', () => {
    const src = read('src/components/three/play/DroneSquad.tsx');
    assert.ok(src.includes('writeSpatialSnapshot'), 'DroneSquad.tsx must call writeSpatialSnapshot as its own PASS 1');
    // Anchor on the actual PASS-1/PASS-2 call sites inside the fixed-step
    // callback (`droneRefs.current[i]?.writeSpatialSnapshot(` / `drone?.update(`)
    // rather than the bare substrings `writeSpatialSnapshot`/`.update(`, which
    // also appear earlier in this file's own 9C-era doc comment prose and
    // would give a false ordering result.
    const snapshotCallIndex = src.indexOf('?.writeSpatialSnapshot(');
    const updateCallIndex = src.indexOf('drone?.update(');
    assert.ok(snapshotCallIndex > 0 && updateCallIndex > snapshotCallIndex, 'PASS 1 (writeSpatialSnapshot call) must appear before PASS 2 (update call) in source order');
  });

  it('Milestone 9C — WindLift.tsx (protected) does not import any droneAi* module', () => {
    const src = read('src/components/three/play/WindLift.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'WindLift.tsx is an unrelated protected system — it must never reference the drone AI core');
  });

  it('Milestone 9C — shadowCasterPolicy.ts (protected shadow system) does not import any droneAi* module', () => {
    const src = read('src/lib/v2/operators/shadowCasterPolicy.ts');
    assert.ok(!src.includes('/ai/droneAi'), 'The shadow-casting system is unrelated and protected — it must never reference the drone AI core');
  });
});

describe('droneAiImportGuards — Milestone 9C scope fence (no FOV/hearing/squad/navigation)', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting field-of-view, hearing, squad-shared perception, or navigation/pathfinding', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs
      .readdirSync(dir)
      .filter((name) => /fov|hearing|squadperception|squadaware|navmesh|pathfind|navigation/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — FOV/hearing/squad-shared perception/navigation all remain explicitly out of scope for 9C`);
  });

  it('droneAiPerception.ts defines no field-of-view, hearing, partial-cover, visibility-scoring, or squad-shared-perception concept', () => {
    const src = read('src/lib/v2/ai/droneAiPerception.ts');
    const forbidden = ['fieldOfView', 'fovDeg', 'hearingRadius', 'partialCover', 'visibilityScore', 'squadShared', 'otherDrone'];
    for (const term of forbidden) {
      assert.ok(!src.includes(term), `droneAiPerception.ts must not introduce "${term}" — out of scope for this phase's own perception model`);
    }
  });

  it('droneAiStateMachine.ts and droneAiPerception.ts do not import any pathfinding/navmesh dependency', () => {
    for (const file of ['src/lib/v2/ai/droneAiStateMachine.ts', 'src/lib/v2/ai/droneAiPerception.ts']) {
      const src = read(file);
      assert.ok(!/navmesh|pathfind|astar|a-star/i.test(src), `${file} must not depend on any navigation/pathfinding system — movement stays direct-steering this phase`);
    }
  });
});

describe('droneAiImportGuards — Milestone 9D scope fence (no boids/combat-sector/navigation/arena-boundary/stuck-recovery)', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting boids cohesion/alignment, combat-sector reservation, shooter limits, squad coordination, waypoint/navmesh/pathfinding, arena boundaries, or stuck recovery', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs
      .readdirSync(dir)
      .filter((name) => /boids|cohesion|alignment|combatsector|sectorreservation|shooterlimit|squadcoord|waypoint|navmesh|pathfind|navigation|arenaboundary|stuckrecovery|evade|flank/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — 9D's own brief explicitly fences these to 9E-9G`);
  });

  it('droneAiMovementIntent.ts defines no combat-sector, shooter-limit, squad-target-sharing, flanking, waypoint/navmesh, arena-boundary, or stuck-recovery concept', () => {
    const src = read('src/lib/v2/ai/droneAiMovementIntent.ts');
    const forbidden = ['combatSector', 'sectorReservation', 'shooterLimit', 'maxSimultaneousShooters', 'sharedLastKnown', 'flank', 'waypoint', 'navmesh', 'arenaBoundary', 'stuckRecovery', 'cohesion', 'alignment'];
    for (const term of forbidden) {
      assert.ok(!src.includes(term), `droneAiMovementIntent.ts must not introduce "${term}" — out of scope for 9D, belongs to 9E-9G`);
    }
  });

  it('droneAiMovementIntent.ts does not import any pathfinding/navmesh dependency', () => {
    const src = read('src/lib/v2/ai/droneAiMovementIntent.ts');
    assert.ok(!/navmesh|pathfind|astar|a-star/i.test(src), 'droneAiMovementIntent.ts must not depend on any navigation/pathfinding system — separation stays local XZ steering this phase');
  });

  it('droneAiMovementIntent.ts does not add drone-vs-drone Rapier collision (no RigidBody/Collider reference)', () => {
    const src = read('src/lib/v2/ai/droneAiMovementIntent.ts');
    assert.ok(!/RigidBody|Collider/.test(src), 'droneAiMovementIntent.ts must stay pure local steering — no physics bodies/colliders, per the phase brief\'s explicit "do not add Rapier bodies to drones" instruction');
  });

  it('droneAiStateMachine.ts is unchanged in scope by 9D — still defines no movement-intent/separation concept of its own', () => {
    const src = read('src/lib/v2/ai/droneAiStateMachine.ts');
    const forbidden = ['separationDirection', 'separationStrength', 'DroneSpatialSnapshot', 'neighbourRadius'];
    for (const term of forbidden) {
      assert.ok(!src.includes(term), `droneAiStateMachine.ts must not gain any separation/spatial-snapshot concept — that responsibility belongs entirely to droneAiMovementIntent.ts, keeping state-transition timing untouched by 9D`);
    }
  });
});

describe('droneAiImportGuards — Milestone 9E scope fence (no burst/shot-count fields, telegraph never drives combat truth)', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting burst fire, multi-shot, or a shooter-limit/reservation system', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs.readdirSync(dir).filter((name) => /burst|multishot|shooterlimit|sectorreservation/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — 9E's own brief explicitly forbids adding unused burst/shot-count fields`);
  });

  it('Rule 3 — neither droneAiStateMachine.ts, droneAiTypes.ts, nor droneAiDifficulty.ts introduces a burst/multi-shot/shot-count concept', () => {
    const forbidden = ['burstSize', 'burstGap', 'shotsPerAttack', 'shotCount', 'multiShot'];
    for (const file of ['src/lib/v2/ai/droneAiStateMachine.ts', 'src/lib/v2/ai/droneAiTypes.ts', 'src/lib/v2/ai/droneAiDifficulty.ts']) {
      const src = read(file);
      for (const term of forbidden) {
        assert.ok(!src.includes(term), `${file} must not introduce "${term}" — Rule 3 keeps the single-shot attack model unchanged this phase`);
      }
    }
  });

  it('DroneEnemy.tsx still makes exactly one DroneBoltPool.spawn() call per completed attack', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    const matches = src.match(/bolts\.spawn\(/g) ?? [];
    assert.strictEqual(matches.length, 1, 'DroneEnemy.tsx must contain exactly one bolts.spawn( call site — the single-shot attack model is unchanged by 9E');
  });

  it('attackWindupMs is never scaled per-difficulty in droneAiDifficulty.ts — every tier reuses the same DRONE.WINDUP_MS reference, never a second numeric literal', () => {
    const src = read('src/lib/v2/ai/droneAiDifficulty.ts');
    assert.ok(src.includes('DRONE.WINDUP_MS'), 'droneAiDifficulty.ts must source attackWindupMs from DRONE.WINDUP_MS, reused rather than restated');
    assert.ok(!/attackWindupMs:\s*\d/.test(src), 'droneAiDifficulty.ts must never assign attackWindupMs a raw numeric literal — it must always come from DRONE.WINDUP_MS, identical across every difficulty');
  });

  it('Rule 4 — droneAiTelegraph.ts (presentation) never IMPORTS droneAiStateMachine.ts/droneAiMovementIntent.ts (combat truth) — the two are structurally decoupled. Anchored on actual import syntax, not prose, since this file\'s own doc comment legitimately discusses both by name.', () => {
    const src = read('src/lib/v2/ai/droneAiTelegraph.ts');
    assert.ok(!/from\s+['"]\.\/droneAiStateMachine['"]/.test(src), 'droneAiTelegraph.ts must not import droneAiStateMachine.ts — presentation must never feed back into or directly couple to the pure combat state machine');
    assert.ok(!/from\s+['"]\.\/droneAiMovementIntent['"]/.test(src), 'droneAiTelegraph.ts must not import droneAiMovementIntent.ts either — it is a presentation-only module, unrelated to movement');
  });

  it('Rule 4 — droneAiStateMachine.ts never IMPORTS droneAiTelegraph.ts (no reverse coupling). Anchored on actual import syntax, not prose, since this file\'s own doc comment legitimately discusses droneAiTelegraph.ts by name.', () => {
    const src = read('src/lib/v2/ai/droneAiStateMachine.ts');
    assert.ok(!/from\s+['"]\.\/droneAiTelegraph['"]/.test(src), 'droneAiStateMachine.ts must not import droneAiTelegraph.ts — the pure state machine has no presentation concept at all');
  });

  it('droneAiStateMachine.ts introduces no new AI state — DroneAiRuntimeState is unchanged in shape from 9C (still six states)', () => {
    const src = read('src/lib/v2/ai/droneAiTypes.ts');
    const match = src.match(/export type DroneAiRuntimeState = ([^;]+);/);
    assert.ok(match, 'DroneAiRuntimeState union must still be declared');
    const states = match![1].match(/'[a-z-]+'/g) ?? [];
    assert.deepStrictEqual(states.sort(), ["'attacking'", "'destroyed'", "'engaging'", "'investigating'", "'searching'", "'spawning'"].sort(), '9E must not add or remove a runtime AI state');
  });

  it('DroneBoltPool.tsx remains untouched by droneAiDifficulty.ts/droneAiTelegraph.ts specifically', () => {
    const src = read('src/components/three/play/DroneBoltPool.tsx');
    assert.ok(!src.includes('droneAiDifficulty'), 'DroneBoltPool.tsx must not reference droneAiDifficulty.ts');
    assert.ok(!src.includes('droneAiTelegraph'), 'DroneBoltPool.tsx must not reference droneAiTelegraph.ts');
  });

  it('VortexFireSystem.tsx (protected player weapon system) is untouched by any droneAi* module', () => {
    for (const relPath of ['src/components/three/weapons/VortexFireSystem.tsx', 'src/components/three/range/VortexFireSystem.tsx']) {
      const src = read(relPath);
      assert.ok(!src.includes('/ai/droneAi'), `${relPath} must never reference the drone AI core — it is an unrelated, protected player weapon system`);
    }
  });

  it('DroneSquad.tsx resolves the difficulty profile via useMemo (once per difficulty change), not inside its per-frame useFrame body', () => {
    const src = read('src/components/three/play/DroneSquad.tsx');
    const memoIndex = src.indexOf('useMemo(() => resolveDroneAiDifficultyProfile');
    const frameIndex = src.indexOf('useFrame((');
    assert.ok(memoIndex > 0, 'DroneSquad.tsx must resolve droneProfile via useMemo');
    assert.ok(frameIndex > 0 && memoIndex < frameIndex, 'the droneProfile useMemo must be declared before (outside) the useFrame callback, not recomputed per frame');
    // Anchored on the actual IMPORT statement, not a bare substring — this
    // file's own doc comment legitimately discusses the old
    // resolveDroneConfig(...) call by name when explaining what changed.
    assert.ok(!/import\s*{[^}]*\bresolveDroneConfig\b[^}]*}\s*from/.test(src), 'DroneSquad.tsx must no longer import resolveDroneConfig directly — resolveDroneAiDifficultyProfile() (which itself reuses resolveDroneConfig internally, inside droneAiDifficulty.ts) is now the one source');
  });
});

describe('droneAiImportGuards — route scoping', () => {
  it('/v2/range (RangeScene.tsx) does not import any droneAi* module', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'RangeScene.tsx must never reference the play-only drone AI core');
  });

  it('V1 /play (game/player/PlayerController.tsx) does not import any droneAi* module', () => {
    const src = read('src/components/game/player/PlayerController.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'V1 PlayerController.tsx must never reference the V2-only drone AI core');
  });

  it('Milestone 9D — /v2/range (RangeScene.tsx) does not import droneAiMovementIntent.ts specifically', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('droneAiMovementIntent'), 'RangeScene.tsx must never reference the new movement-intent module');
  });

  it('Milestone 9E — /v2/range (RangeScene.tsx) does not import droneAiDifficulty.ts or droneAiTelegraph.ts specifically', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('droneAiDifficulty'), 'RangeScene.tsx must never reference the new difficulty-profile module');
    assert.ok(!src.includes('droneAiTelegraph'), 'RangeScene.tsx must never reference the new telegraph module');
  });

  it('no V1 source file under src/components/game or src/lib/game imports any droneAi* module', () => {
    const roots = ['src/components/game', 'src/lib/game'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('/ai/droneAi')) offenders.push(full);
      }
    };
    for (const root of roots) walk(path.join(repoRoot, root));
    assert.deepStrictEqual(offenders, [], `V1 files must never import the drone AI core: ${offenders.join(', ')}`);
  });
});
