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
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PURE_CORE_FILES = ['src/lib/v2/ai/droneAiTypes.ts', 'src/lib/v2/ai/droneAiRandom.ts', 'src/lib/v2/ai/droneAiStateMachine.ts', 'src/lib/v2/ai/droneAiPerception.ts'];

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

describe('droneAiImportGuards — route scoping', () => {
  it('/v2/range (RangeScene.tsx) does not import any droneAi* module', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'RangeScene.tsx must never reference the play-only drone AI core');
  });

  it('V1 /play (game/player/PlayerController.tsx) does not import any droneAi* module', () => {
    const src = read('src/components/game/player/PlayerController.tsx');
    assert.ok(!src.includes('/ai/droneAi'), 'V1 PlayerController.tsx must never reference the V2-only drone AI core');
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
