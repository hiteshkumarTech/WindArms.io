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
 *
 * Milestone 9F extends this file with `droneArenaConfig.ts` (plain derived
 * data — deliberately imports `DRONE_SPAWNS`/`MAIN_DECK` from
 * `lib/v2/play/spawnConfig.ts` and `WIND_LIFT` from
 * `lib/v2/play/constants.ts`, neither of which pulls in anything forbidden,
 * mirroring `droneAiPerception.ts`'s own established precedent for reusing
 * plain-data route constants), `droneAiArenaConstraints.ts`, and
 * `droneAiStuckRecovery.ts` (all three now subject to every pure-core guard
 * above via `PURE_CORE_FILES`). This phase also, for the first and only
 * time, makes a small, disclosed, ADDITIVE change to `droneAiTypes.ts`/
 * `droneAiStateMachine.ts` themselves (one new OPTIONAL observation field,
 * `recoveryBlocksAttack` — see those files' own doc comments) — the new
 * 9F-specific describe block below re-confirms the six-state union is
 * unchanged and that this file stays fully decoupled from
 * `droneAiStuckRecovery.ts` in the one direction that matters (the recovery
 * module never imports the state machine back).
 *
 * Milestone 9G extends this file with `droneAiSquad.ts` (also now subject
 * to every pure-core guard above via `PURE_CORE_FILES` — it deliberately
 * imports `TrialDifficulty` from `lib/v2/play/difficulty.ts`, the same
 * established read-only reuse precedent `droneAiDifficulty.ts` already set).
 * This phase makes the SAME kind of small, disclosed, ADDITIVE change to
 * `droneAiTypes.ts`/`droneAiStateMachine.ts` 9F already made (a second new
 * OPTIONAL observation field, `coordinationBlocksAttack`) — the new
 * 9G-specific describe block below re-confirms the six-state union is STILL
 * unchanged, that `droneAiSquad.ts` never imports the state machine or the
 * movement-intent module, that a granted lease's `sector` is never fed into
 * any movement/steering concept, and that every prior milestone's own
 * protected-file list (the full 9F module set, `droneAiMovementIntent.ts`,
 * `droneAiDifficulty.ts`, `droneAiTelegraph.ts`, `DroneBoltPool.tsx`,
 * `WindLift.tsx`, `PlayerController.tsx`, `/v2/range`, V1 `/play`) remains
 * byte-unreferenced by any new 9G module.
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
  'src/lib/v2/ai/droneArenaConfig.ts',
  'src/lib/v2/ai/droneAiArenaConstraints.ts',
  'src/lib/v2/ai/droneAiStuckRecovery.ts',
  'src/lib/v2/ai/droneAiSquad.ts',
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

describe('droneAiImportGuards — Milestone 9D scope fence (no boids/combat-sector/navigation) — arena-boundary/stuck-recovery moved to the Milestone 9F describe block below, since 9F is the phase that legitimately introduces them', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting boids cohesion/alignment, combat-sector reservation, shooter limits, squad coordination, or waypoint/navmesh/pathfinding', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs
      .readdirSync(dir)
      .filter((name) => /boids|cohesion|alignment|combatsector|sectorreservation|shooterlimit|squadcoord|waypoint|navmesh|pathfind|navigation|evade|flank/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — still out of scope through 9F, fenced to 9E-9G`);
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

describe('droneAiImportGuards — Milestone 9F scope fence (arena constraints + stuck recovery, no navmesh/combat-nodes/squad-coordination)', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting navmesh/pathfinding/waypoint graphs, combat nodes, shooter limits, sector reservation, or a squad coordinator', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs
      .readdirSync(dir)
      .filter((name) => /navmesh|pathfind|waypointgraph|combatnode|shooterlimit|sectorreservation|squadcoord/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — 9F's own brief explicitly forbids these`);
  });

  it('droneAiArenaConstraints.ts defines no combat-node, cover-collision, Rapier body, or drone-vs-drone collision CODE concept (anchored on camelCase identifiers, not prose — this file\'s own doc comment legitimately discusses "navmesh"/"pathfind" by name when explaining what it deliberately is NOT)', () => {
    const src = read('src/lib/v2/ai/droneAiArenaConstraints.ts');
    const forbidden = ['combatNode', 'RigidBody', 'Collider', 'coverCollision'];
    for (const term of forbidden) {
      assert.ok(!src.includes(term), `droneAiArenaConstraints.ts must not introduce "${term}" — 9F is arena-envelope clamping only, not obstacle avoidance`);
    }
  });

  it('droneAiArenaConstraints.ts does not IMPORT any navmesh/pathfinding dependency (syntax-anchored, not prose)', () => {
    const src = read('src/lib/v2/ai/droneAiArenaConstraints.ts');
    assert.ok(!/from\s+['"][^'"]*(navmesh|pathfind|astar)/i.test(src));
  });

  it('droneAiStuckRecovery.ts defines no combat-node, squad-coordination, or shared-recovery-state CODE concept (anchored on camelCase identifiers, not prose)', () => {
    const src = read('src/lib/v2/ai/droneAiStuckRecovery.ts');
    const forbidden = ['combatNode', 'squadCoordinator', 'sharedRecoveryState', 'sharedTargetMemory'];
    for (const term of forbidden) {
      assert.ok(!src.includes(term), `droneAiStuckRecovery.ts must not introduce "${term}" — recovery is a per-drone overlay, never a squad-shared concept`);
    }
  });

  it('droneAiStuckRecovery.ts does not declare its own DroneAiRuntimeState-shaped union or import one from droneAiTypes.ts (it may only discuss the type BY NAME in prose — see the syntax-anchored import check above)', () => {
    const src = read('src/lib/v2/ai/droneAiStuckRecovery.ts');
    assert.ok(!/import[^;]*\bDroneAiRuntimeState\b/.test(src), 'droneAiStuckRecovery.ts must not import DroneAiRuntimeState — it has zero knowledge of the pure state machine\'s own state union');
    assert.ok(!/export type DroneAiRuntimeState/.test(src), 'droneAiStuckRecovery.ts must not redeclare DroneAiRuntimeState');
  });

  it('droneAiStuckRecovery.ts never imports droneAiStateMachine.ts or droneAiMovementIntent.ts — the overlay stays fully decoupled, and never touches the protected movement module', () => {
    const src = read('src/lib/v2/ai/droneAiStuckRecovery.ts');
    assert.ok(!/from\s+['"]\.\/droneAiStateMachine['"]/.test(src), 'droneAiStuckRecovery.ts must not import droneAiStateMachine.ts');
    assert.ok(!/from\s+['"]\.\/droneAiMovementIntent['"]/.test(src), 'droneAiStuckRecovery.ts must not import droneAiMovementIntent.ts (protected)');
  });

  it('droneAiArenaConstraints.ts never imports droneAiMovementIntent.ts — stays fully self-contained (its own independently-defined hash helper, see its own doc comment)', () => {
    const src = read('src/lib/v2/ai/droneAiArenaConstraints.ts');
    assert.ok(!/from\s+['"]\.\/droneAiMovementIntent['"]/.test(src));
  });

  it('droneArenaConfig.ts is plain derived data — no runtime mutable singleton, no class, no Math.random', () => {
    const src = read('src/lib/v2/ai/droneArenaConfig.ts');
    assert.ok(!src.includes('Math.random('));
    assert.ok(!/\bclass\s+\w/.test(src), 'droneArenaConfig.ts must stay plain exported data/functions, never a stateful class');
  });

  it('droneAiStuckRecovery.ts and droneAiArenaConstraints.ts use no timer/interval/rAF APIs', () => {
    for (const file of ['src/lib/v2/ai/droneAiStuckRecovery.ts', 'src/lib/v2/ai/droneAiArenaConstraints.ts']) {
      const src = read(file);
      assert.ok(!src.includes('setTimeout('), `${file} must not use setTimeout`);
      assert.ok(!src.includes('setInterval('), `${file} must not use setInterval`);
      assert.ok(!src.includes('requestAnimationFrame('), `${file} must not use requestAnimationFrame`);
    }
  });

  it('droneAiTypes.ts DroneAiRuntimeState union is unchanged by 9F — still exactly six states', () => {
    const src = read('src/lib/v2/ai/droneAiTypes.ts');
    const match = src.match(/export type DroneAiRuntimeState = ([^;]+);/);
    assert.ok(match, 'DroneAiRuntimeState union must still be declared');
    const states = match![1].match(/'[a-z-]+'/g) ?? [];
    assert.deepStrictEqual(states.sort(), ["'attacking'", "'destroyed'", "'engaging'", "'investigating'", "'searching'", "'spawning'"].sort(), '9F must not add or remove a runtime AI state — recovery is an overlay, not a state');
  });

  it('droneAiTelegraph.ts is untouched by 9F — no new telegraph phase, no reference to the new arena/recovery modules', () => {
    const src = read('src/lib/v2/ai/droneAiTelegraph.ts');
    const match = src.match(/export type DroneTelegraphPhase = ([^;]+);/);
    assert.ok(match);
    const phases = match![1].match(/'[a-z-]+'/g) ?? [];
    assert.deepStrictEqual(phases.sort(), ["'idle'", "'acquire'", "'reaction'", "'windup'", "'fire'", "'cooldown'", "'hit'", "'destroyed'"].sort(), '9F must not add a recovery telegraph phase');
    assert.ok(!src.includes('droneAiStuckRecovery'), 'droneAiTelegraph.ts must not reference the new recovery module');
    assert.ok(!src.includes('droneArenaConfig'), 'droneAiTelegraph.ts must not reference the new arena-config module');
  });

  it('droneAiMovementIntent.ts (protected) does not reference any new 9F module', () => {
    const src = read('src/lib/v2/ai/droneAiMovementIntent.ts');
    assert.ok(!src.includes('droneArenaConfig'));
    assert.ok(!src.includes('droneAiArenaConstraints'));
    assert.ok(!src.includes('droneAiStuckRecovery'));
  });

  it('droneAiDifficulty.ts (protected) does not reference any new 9F module', () => {
    const src = read('src/lib/v2/ai/droneAiDifficulty.ts');
    assert.ok(!src.includes('droneArenaConfig'));
    assert.ok(!src.includes('droneAiArenaConstraints'));
    assert.ok(!src.includes('droneAiStuckRecovery'));
  });

  it('DroneBoltPool.tsx (protected) remains untouched by any 9F module', () => {
    const src = read('src/components/three/play/DroneBoltPool.tsx');
    assert.ok(!src.includes('droneArenaConfig'));
    assert.ok(!src.includes('droneAiArenaConstraints'));
    assert.ok(!src.includes('droneAiStuckRecovery'));
  });

  it('WindLift.tsx and PlayerController.tsx (protected) remain untouched by any 9F module', () => {
    for (const relPath of ['src/components/three/play/WindLift.tsx', 'src/components/three/play/PlayerController.tsx']) {
      const src = read(relPath);
      assert.ok(!src.includes('/ai/droneAi') && !src.includes('droneArenaConfig'), `${relPath} must never reference the drone AI/arena core`);
    }
  });

  it('DroneEnemy.tsx does not create its own useFrame even after the 9F movement-order rewrite — DroneSquad remains the sole frame owner', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(!src.includes('useFrame'), 'DroneEnemy.tsx must stay a pure imperative-handle adapter after 9F');
  });

  it('DroneEnemy.tsx uses no timer/interval APIs for recovery (all timing is explicit-timestamp-driven through the fixed-step owner)', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(!src.includes('setTimeout('));
    assert.ok(!src.includes('setInterval('));
  });

  it('/v2/range (RangeScene.tsx) does not import any new 9F module', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('droneArenaConfig'));
    assert.ok(!src.includes('droneAiArenaConstraints'));
    assert.ok(!src.includes('droneAiStuckRecovery'));
  });

  it('no V1 source file under src/components/game or src/lib/game references any new 9F module', () => {
    const roots = ['src/components/game', 'src/lib/game'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (src.includes('droneArenaConfig') || src.includes('droneAiArenaConstraints') || src.includes('droneAiStuckRecovery')) offenders.push(full);
        }
      }
    };
    for (const root of roots) walk(path.join(repoRoot, root));
    assert.deepStrictEqual(offenders, [], `V1 files must never import any 9F module: ${offenders.join(', ')}`);
  });
});

describe('droneAiImportGuards — Milestone 9G scope fence (squad attack-permit coordination, no formations/flanking/target-calling/navmesh)', () => {
  it('no file under src/lib/v2/ai/ has a name suggesting formations, flanking, target-calling, squad leaders, combat nodes, or navmesh/pathfinding', () => {
    const dir = path.join(repoRoot, 'src/lib/v2/ai');
    const suspicious = fs
      .readdirSync(dir)
      .filter((name) => /formation|flank|targetcall|squadleader|combatnode|navmesh|pathfind|waypointgraph/i.test(name));
    assert.deepStrictEqual(suspicious, [], `unexpected out-of-scope file(s) found in lib/v2/ai/: ${suspicious.join(', ')} — 9G's own brief explicitly forbids these`);
  });

  it('droneAiSquad.ts defines no formation, flanking, target-calling, squad-leader, combat-node, shared-target-memory, or global-volley-timer CODE concept (word-boundary-anchored so legitimate prose like "informational" never false-positives on "formation")', () => {
    const src = read('src/lib/v2/ai/droneAiSquad.ts');
    const forbidden = ['formation', 'flank', 'targetCall', 'squadLeader', 'combatNode', 'sharedTargetMemory', 'globalVolley', 'volleyTimer', 'fireRateTimer'];
    for (const term of forbidden) {
      const pattern = new RegExp(`\\b${term}\\b`, 'i');
      assert.ok(!pattern.test(src), `droneAiSquad.ts must not introduce "${term}" — 9G is attack-permit coordination only, none of the wider squad-AI concepts explicitly ruled out of scope`);
    }
  });

  it('droneAiSquad.ts does not IMPORT any navmesh/pathfinding dependency (syntax-anchored, not prose)', () => {
    const src = read('src/lib/v2/ai/droneAiSquad.ts');
    assert.ok(!/from\s+['"][^'"]*(navmesh|pathfind|astar)/i.test(src));
  });

  it('droneAiSquad.ts never imports droneAiStateMachine.ts or droneAiMovementIntent.ts — the coordinator stays fully decoupled, one-directional (the adapter is the only place the two ever meet)', () => {
    const src = read('src/lib/v2/ai/droneAiSquad.ts');
    assert.ok(!/from\s+['"]\.\/droneAiStateMachine['"]/.test(src), 'droneAiSquad.ts must not import droneAiStateMachine.ts');
    assert.ok(!/from\s+['"]\.\/droneAiMovementIntent['"]/.test(src), 'droneAiSquad.ts must not import droneAiMovementIntent.ts (protected)');
  });

  it('droneAiStateMachine.ts never IMPORTS droneAiSquad.ts (no reverse coupling) — anchored on actual import syntax, not prose', () => {
    const src = read('src/lib/v2/ai/droneAiStateMachine.ts');
    assert.ok(!/from\s+['"]\.\/droneAiSquad['"]/.test(src), 'droneAiStateMachine.ts must not import droneAiSquad.ts — the pure state machine only ever reads the one boolean the adapter derives from it');
  });

  it('CRITICAL SCOPE DECISION — a granted lease\'s sector is never fed into any movement/steering concept: droneAiSquad.ts declares no sector-to-position/direction/steering conversion IDENTIFIER, and droneAiMovementIntent.ts never references sector/permit/lease/coordination at all', () => {
    const squadSrc = read('src/lib/v2/ai/droneAiSquad.ts');
    // Anchored on actual combined-identifier names a movement-facing sector
    // API would need to expose — NOT a proximity regex (fragile: "sector"
    // and "position" legitimately co-occur in this file already, since a
    // sector is CORRECTLY computed FROM a drone's current position — that is
    // not a violation, only a function that turned a sector back INTO a
    // position/direction/steering target would be).
    const forbiddenIdentifiers = ['sectorDirection', 'sectorPosition', 'sectorTarget', 'sectorToPosition', 'sectorToDirection', 'moveToSector', 'steerToSector', 'sectorWaypoint', 'sectorDestination'];
    for (const identifier of forbiddenIdentifiers) {
      assert.ok(!squadSrc.includes(identifier), `droneAiSquad.ts must not declare "${identifier}" — a sector is firing-permit metadata only, never converted back into a movement input`);
    }
    const movementSrc = read('src/lib/v2/ai/droneAiMovementIntent.ts');
    for (const term of ['sector', 'permit', 'lease', 'coordinationBlocksAttack', 'droneAiSquad']) {
      assert.ok(!movementSrc.includes(term), `droneAiMovementIntent.ts (protected) must not reference "${term}" — firing-permit sectors are never movement destinations`);
    }
  });

  it('droneAiSquad.ts consumes no RNG (no Math.random, no RandomSource import) and reads no clock of its own beyond the explicit nowMs parameter', () => {
    const src = read('src/lib/v2/ai/droneAiSquad.ts');
    assert.ok(!src.includes('Math.random('));
    assert.ok(!/from\s+['"]\.\/droneAiRandom['"]/.test(src), 'droneAiSquad.ts must not import droneAiRandom.ts — every fairness tiebreak is deterministic (drone-ID compare), never randomized');
  });

  it('droneAiSquad.ts uses no timer/interval/rAF APIs', () => {
    const src = read('src/lib/v2/ai/droneAiSquad.ts');
    assert.ok(!src.includes('setTimeout('));
    assert.ok(!src.includes('setInterval('));
    assert.ok(!src.includes('requestAnimationFrame('));
  });

  it('droneAiTypes.ts DroneAiRuntimeState union is unchanged by 9G — still exactly six states', () => {
    const src = read('src/lib/v2/ai/droneAiTypes.ts');
    const match = src.match(/export type DroneAiRuntimeState = ([^;]+);/);
    assert.ok(match, 'DroneAiRuntimeState union must still be declared');
    const states = match![1].match(/'[a-z-]+'/g) ?? [];
    assert.deepStrictEqual(states.sort(), ["'attacking'", "'destroyed'", "'engaging'", "'investigating'", "'searching'", "'spawning'"].sort(), '9G must not add or remove a runtime AI state — coordination is a squad-owned permit result, not a state');
  });

  it('droneAiTelegraph.ts is untouched by 9G — no new telegraph phase, no reference to the squad coordinator', () => {
    const src = read('src/lib/v2/ai/droneAiTelegraph.ts');
    const match = src.match(/export type DroneTelegraphPhase = ([^;]+);/);
    assert.ok(match);
    const phases = match![1].match(/'[a-z-]+'/g) ?? [];
    assert.deepStrictEqual(phases.sort(), ["'idle'", "'acquire'", "'reaction'", "'windup'", "'fire'", "'cooldown'", "'hit'", "'destroyed'"].sort(), '9G must not add a coordination/sector telegraph phase');
    assert.ok(!src.includes('droneAiSquad'), 'droneAiTelegraph.ts must not reference the new squad coordinator module');
  });

  it('droneAiDifficulty.ts, droneAiMovementIntent.ts, droneAiStuckRecovery.ts, droneAiArenaConstraints.ts, droneArenaConfig.ts (all protected) do not reference the new 9G module', () => {
    for (const relPath of [
      'src/lib/v2/ai/droneAiDifficulty.ts',
      'src/lib/v2/ai/droneAiMovementIntent.ts',
      'src/lib/v2/ai/droneAiStuckRecovery.ts',
      'src/lib/v2/ai/droneAiArenaConstraints.ts',
      'src/lib/v2/ai/droneArenaConfig.ts',
    ]) {
      const src = read(relPath);
      assert.ok(!src.includes('droneAiSquad'), `${relPath} must not reference droneAiSquad.ts`);
    }
  });

  it('DroneBoltPool.tsx, WindLift.tsx, PlayerController.tsx (protected) remain untouched by the new 9G module', () => {
    for (const relPath of ['src/components/three/play/DroneBoltPool.tsx', 'src/components/three/play/WindLift.tsx', 'src/components/three/play/PlayerController.tsx']) {
      const src = read(relPath);
      assert.ok(!src.includes('droneAiSquad'), `${relPath} must never reference the squad coordinator`);
    }
  });

  it('DroneEnemy.tsx does not create its own useFrame even after the 9G prepareAttackRequest addition — DroneSquad remains the sole frame owner', () => {
    const src = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(!src.includes('useFrame'), 'DroneEnemy.tsx must stay a pure imperative-handle adapter after 9G');
  });

  it('DroneEnemy.tsx exposes prepareAttackRequest without creating a second frame owner, and DroneSquad.tsx calls it BEFORE update() in source order (prepare -> coordinate -> commit, never order-dependent)', () => {
    const enemySrc = read('src/components/three/play/DroneEnemy.tsx');
    assert.ok(enemySrc.includes('prepareAttackRequest'), 'DroneEnemy.tsx must expose the new prepareAttackRequest handle method for DroneSquad\'s prepare pass');
    const squadSrc = read('src/components/three/play/DroneSquad.tsx');
    // Anchored on the actual CALL SITES, not the doc comment above them —
    // this file's own doc comment legitimately mentions
    // `resolveDroneSquadCoordination()` by name in prose (with its own
    // empty-parens function-reference style), so the real call is anchored
    // on its distinctive first argument instead of the bare function name.
    const prepareCallIndex = squadSrc.indexOf('?.prepareAttackRequest(');
    const coordinateCallIndex = squadSrc.indexOf('resolveDroneSquadCoordination(coordinatorRuntimeRef');
    const updateCallIndex = squadSrc.indexOf('drone?.update(');
    assert.ok(prepareCallIndex > 0 && coordinateCallIndex > prepareCallIndex && updateCallIndex > coordinateCallIndex, 'PASS order must be prepare -> coordinate -> commit in source order, never a single per-drone loop that both requests and commits inline');
  });

  it('DroneSquad.tsx resets the squad coordinator runtime in the SAME restart branch that resets every drone and clears the bolt pool', () => {
    const src = read('src/components/three/play/DroneSquad.tsx');
    const restartBranchMatch = src.match(/restartNonce !== lastRestartNonce\.current\)\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(restartBranchMatch, 'the restart branch must still exist');
    assert.ok(restartBranchMatch![1].includes('resetDroneSquadCoordinatorRuntime'), 'restart must clear the squad coordinator runtime alongside every drone reset and the bolt-pool clear — "restarts clear everything"');
  });

  it('/v2/range (RangeScene.tsx) does not import the new 9G module', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('droneAiSquad'));
  });

  it('no V1 source file under src/components/game or src/lib/game references the new 9G module', () => {
    const roots = ['src/components/game', 'src/lib/game'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (src.includes('droneAiSquad')) offenders.push(full);
        }
      }
    };
    for (const root of roots) walk(path.join(repoRoot, root));
    assert.deepStrictEqual(offenders, [], `V1 files must never import the 9G module: ${offenders.join(', ')}`);
  });
});
