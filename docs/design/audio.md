# WindArms — Audio

> "Audio Identity" section extracted from [art-direction.md](art-direction.md) (2026-07-14), content preserved verbatim — that was V2 creative-direction text, originally from `src/components/game/hud/CLAUDE.md`. V1 section below is the actual shipped implementation, cross-referenced from [../gameplay/mechanics.md](../gameplay/mechanics.md).

## V1 audio (shipped, real)

Audio is 100% synthesized on raw Web Audio — noise bursts through biquad filters plus enveloped oscillators, zero audio assets shipped. Each weapon class has its own shot recipe (the shotgun booms, the SMG cracks, the energy rifle adds a descending square-wave whine); remote shots are spatialized with stereo panning and distance attenuation computed against the listener's pose. Hits, damage, deaths, respawns, reloads, dry-fire, jumps, landings (scaled by impact speed) and speed-cadenced footsteps are all covered, with a master volume slider in settings. The context unlocks on the pointer-lock gesture to satisfy autoplay policy and fails silently where unavailable. (Full detail: [../gameplay/mechanics.md](../gameplay/mechanics.md#maps-audio--vfx).)

Two shipped bugfixes worth knowing before touching audio code: `AudioEngine.ensure()`'s async-resume check was fixed (see [../technical/architecture.md](../technical/architecture.md#stability-fix-raycasteraudio-bug)) — don't reintroduce a synchronous `state === 'running'` check right after calling `ctx.resume()`, since resume is asynchronous and that check can never pass.

## V2 audio direction (content mostly not yet implemented; architecture now confirmed — see "Reconciling the two")

The following is the original creative-direction brief — describes the target *content*, most of which no code implements yet:

Not generic gunshots.

Instead:

Every weapon has

deep mechanical turbine spin

compressed air bursts

electromagnetic crack

pressure release

wind resonance

The environment constantly breathes.

You hear distant thunder.

Moving air.

Storm engines.

Metal cables under tension.

## Reconciling the two

V1's audio architecture (100% procedural Web Audio synthesis, per-weapon recipe pattern, spatialization model) is a strong technical foundation to carry into v2 — the V2 direction above describes new *content* (turbine spin, pressure release, wind resonance) more than a new *architecture*. When v2 audio implementation starts, the default assumption should be: reuse the v1 synthesis approach, author new per-weapon (and now per-operator, per-location) recipes matching the wind-powered arsenal in [../gameplay/weapons.md](../gameplay/weapons.md#v2-arsenal-windweaponsts) and the Skyfront locations in [skyfront.md](skyfront.md).

**Confirmed 2026-07-26 (Step 7F, [../decisions.md](../decisions.md)):** this inference is settled, not just reasonable. The Vortex Rifle's fire/reload/dry-fire/impact/spin-down SFX (`src/lib/v2/range/vortexAudio.ts`) are now implemented exactly this way — direct procedural synthesis, no real-audio-file resolution step, live `masterVolume` integration reusing v1's own settings store rather than a new one. This was also the fix for a real bug: an earlier version of that module tried a real-file-first path before falling back to synthesis, which is what generated the "missing fire/reload audio" 404s (nothing was ever placed at those paths, and per this section, nothing was meant to be). The *content* side of the brief above (turbine spin, chuff, EM-crack layer, wind resonance, environmental ambience) remains mostly unwritten — see [weapons/vortex-rifle.md](weapons/vortex-rifle.md) §15 for the Vortex-specific gap.
