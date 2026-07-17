# WindArms Asset Pipeline

The reusable foundation for going from "I have a `.glb`" to "it's rendering in WindArms" — built once so every future weapon, operator, map, and vehicle drop-in follows the same path, regardless of whether the model came from Meshy, Tripo, Blender, Sketchfab, or a hired artist.

This is code documentation, not project documentation — it explains how to use this specific module. Visual/material/color rules live in [`docs/design/art-bible.md`](../../../../docs/design/art-bible.md); this file is about mechanics, not aesthetics.

## The end-to-end flow

```
Drop a .glb into public/v2-art/
        ↓
Add a manifest entry (manifest.ts) — sockets/clips/budget it should have
        ↓
Render <PipelineModel slot="..." fallback={<Procedural.../>} />
        ↓
Pipeline resolves the right LOD, loads it, extracts sockets + clips, validates it (dev only)
        ↓
Falls back to your procedural placeholder automatically if the file's missing
```

No individual weapons/operators/maps are wired up yet — this is the foundation only, per the "build the reusable foundation first" directive. `manifest.ts` ships with a single `__template` entry to copy.

## Folder structure & naming convention

Everything lives flat under `public/v2-art/`, keyed by `{slot}` — the same convention `@/lib/v2/assetResolver.ts` already established for 2D art, extended here for LOD and audio:

| What | Filename pattern | Example |
|---|---|---|
| Model, LOD 0 (highest detail) | `{slot}.glb` | `vortex-rifle.glb` |
| Model, LOD 1 | `{slot}.lod1.glb` | `vortex-rifle.lod1.glb` |
| Model, LOD 2 | `{slot}.lod2.glb` | `vortex-rifle.lod2.glb` |
| Real audio for one event | `{slot}.sfx-{event}.{mp3\|ogg\|wav}` | `vortex-rifle.sfx-fire.mp3` |
| 2D fallback/icon (existing convention) | `{slot}.{webp\|png\|jpg}` | `vortex-rifle.webp` |

`{slot}` is lowercase-kebab, matching [`docs/technical/naming-conventions.md`](../../../../docs/technical/naming-conventions.md)'s existing art-slot rule. LOD 0 has no suffix — an asset with only a single quality level just ships `{slot}.glb` and the pipeline treats that as every LOD.

**Nothing is required to exist.** Every lookup falls back gracefully: missing LODs fall back to the nearest available tier (§ `modelResolver.ts`); missing audio falls back to the existing procedural `AudioEngine` synthesis per event; a missing model entirely falls back to whatever `fallback` prop you pass `<PipelineModel>`.

## Sockets — attachment points

A GLB signals an attachment point with a named empty (no mesh) in the scene graph. Recognized names (see `types.ts`'s `SocketName` — extend that union, don't invent ad hoc names):

- Weapons: `socket_muzzle`, `socket_ejection`, `socket_magazine`, `socket_sight`, `socket_grip_hand`, `socket_grip_support`
- Characters: `socket_hand_right`, `socket_hand_left`, `socket_head`, `socket_spine`

Read sockets via `sockets.get('socket_muzzle')` — this returns a **live** `THREE.Object3D` reference, not a snapshot. To parent React-rendered content (VFX, a held item) to a socket every frame, use `<SocketAnchor socket={...}>` (`components/three/pipeline/SocketAnchor.tsx`) — it copies world transform each frame, matching this project's existing per-frame-ref-sync convention (see `PlayerController.tsx`, `CameraRig.tsx`) rather than mutating the THREE scene graph's parent/child structure directly.

## Animation clips

Name clips in your DCC tool / exporter exactly (case-insensitive): `idle`, `fire`, `reload`, `inspect`, `sprint`, `ads`, `equip`, `unequip` (see `types.ts`'s `ClipName`). Extraction is name-based (`animationClips.ts`) — playback (an `AnimationMixer`) is the consumer's responsibility, not this module's; this is a distinct system from the existing procedural hero-rig pose animator (`heroAnimator.ts`), which stays the default for the primitive-built rig and isn't replaced by this.

## Materials & tinting

Any material named containing `accent`, `energy`, or `tint` is treated as the tintable "identity" material — `applyAccentTint(scene, hex)` swaps its color/emissive. This is the GLB-model equivalent of the existing single-accent-color `WeaponTint`/`HeroSkin` system (`shared/heroes.ts`), not a new tinting scheme. `auditMaterials(scene)` lists every material's color and whether it matches a real `STORM` token, for dev-time sanity-checking against the Art Bible's color rule.

## Audio

`resolveAudio(slot, event)` + `playAudioEvent(slot, event)` (`audio.ts`) resolve and play real audio files if present. **This is deliberately not built on the existing `AudioEngine` singleton** (`@/lib/audio/audioEngine.ts`) — that engine's API is closed over v1's fixed `WeaponId` union and is 100% procedural synthesis by design; opening it to arbitrary v2 slots would mean modifying a real, working v1 system. `playAudioEvent` returns `false` when no real audio exists — the caller is responsible for its own procedural fallback for that event (following `AudioEngine`'s noise/tone recipe pattern is a reasonable model to follow later, but that's the future weapon's own implementation work, not this pipeline's).

## Validation

Runs automatically in development (skipped in production builds) whenever `<PipelineModel>` loads a real GLB, checking the slot's `manifest.ts` entry: required sockets present, required clips present, triangle/material/texture-size budget, unnamed materials. Missing sockets/clips are **warnings** (console only, doesn't block rendering); budget overruns are **errors** (still renders — this is a foundation for catching problems early, not a hard gate — but should be treated as blocking before shipping).

## Quality tier / LOD

LOD selection reads the existing `useGraphicsStore` 2-tier signal (`'high'` | `'low'`, already driven by `PerformanceMonitor` elsewhere in the app) — `'low'` never requests LOD 0, `'high'` prefers LOD 0 and falls back down if that tier's file doesn't exist. This reuses the real, already-shipped performance signal rather than introducing a second one.

## Usage

**Live example:** [`src/components/three/storm/AeolusShowpiece.tsx`](../../../components/three/storm/AeolusShowpiece.tsx) — the first real integration (2026-07-16), resolving the `vortex-rifle` slot with `ProceduralAeolus` kept as its fallback.

```tsx
import PipelineModel from '@/components/three/pipeline/PipelineModel';
import SocketAnchor from '@/components/three/pipeline/SocketAnchor';
import type { PipelineAssetResult } from '@/lib/v2/pipeline';

function VortexRifleMount({ accentTint }: { accentTint?: string }) {
  const [pipelineResult, setPipelineResult] = useState<PipelineAssetResult | null>(null);

  return (
    <PipelineModel
      slot="vortex-rifle"
      fallback={<ProceduralVortexRifle />}
      // Raw source scale is whatever the DCC/generation tool exported —
      // applies ONLY to the real model, never to `fallback`. Compute this
      // from the asset's actual WORLD-SPACE bounding box, not raw local
      // bounds (a node can already carry its own scale — see
      // AeolusShowpiece.tsx's comment for a real example of getting this
      // wrong the first time). `node tools/inspect-glb.mjs <path> --target
      // <viewmodel|showpiece>` reports world bounds directly; don't guess.
      scale={0.68}
      accentTint={accentTint}
      onReady={setPipelineResult}
    />
    // Once loaded, e.g. for a future muzzle-flash hookup:
    // <SocketAnchor socket={pipelineResult?.sockets.get('socket_muzzle')}>
    //   <MuzzleFlashVfx />
    // </SocketAnchor>
  );
}
```

## Before adding a real asset

1. Add a `manifest.ts` entry (copy `__template`) — sockets/clips/budget it should have.
2. Drop the `.glb` into `public/v2-art/` following the naming convention above.
3. Render it through `<PipelineModel>` with a real procedural `fallback` — never skip the fallback, even once you have real art (someone else's slower connection, or a future asset regression, should still get something on screen).
4. Read the console in development — validation warnings/errors tell you exactly what the model is missing before it ships.
