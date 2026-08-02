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
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PURE_CORE_FILES = ['src/lib/v2/ai/droneAiTypes.ts', 'src/lib/v2/ai/droneAiRandom.ts', 'src/lib/v2/ai/droneAiStateMachine.ts'];

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
