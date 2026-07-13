# WindArms — Performance

> Topic-sliced excerpt of the v1 build. Full context in [v1.md](../versions/v1.md); nothing here has been reworded.

## Landing page

Performance decisions: canvas is dynamically imported (`ssr: false`) so the landing shell paints immediately; DPR is clamped to 1.75; MSAA is off because bloom renders offscreen anyway; particles mutate a single `BufferAttribute` per frame (zero allocations in the frame loop); the skyline is two instanced meshes (2 draw calls for ~100 boxes); all procedural layouts use a seeded PRNG so the scene is deterministic.

## Gameplay rendering (Phase 9)

Graphics & rendering: a runtime quality tier (`graphicsStore`) rides the same `PerformanceMonitor` signal that already drove adaptive DPR, gating everything below at `'high'` only so weaker devices never regress below the pre-9.2 baseline. Gameplay gets its own post-processing stack (mipmap bloom tuned for readability, plus a conservative SSAO pass) — the landing page keeps its separate, more decorative one. Shadows are live: a soft PCF shadow map with a fixed frustum sized to the shared 60×60 footprint, cast by the sun light and every piece of arena geometry (the hero rigs were already wired for it and previously rendering flat). Cyber City's floor is a real-time reflection (`MeshReflectorMaterial`) for wet neon streets. A new GPU-driven weather layer — vertex-shader motion, no per-frame CPU buffer rewrite — adds rain to Cyber City and drifting dust to Forest Temple alongside the existing ambient particle presets. Sky domes now drift a subtle procedural cloud band, and a ring of soft camera-following haze sprites gives every grounded map a cheap "volumetric" ground fog.

## Network payload & adaptive resolution (Phase 8)

Snapshots quantize positions to centimeters (~30% smaller payloads), and the game canvas drops render resolution under sustained load and recovers automatically (`PerformanceMonitor`-driven DPR).

## Quality-tier tuning fix (stability round)

`PerformanceMonitor`'s default quality-tier bounds (`[40, 60]` fps) left too narrow a gap for how much render cost one tier flip removes (shadows, post-fx, weather, reflections), causing a self-sustaining hunting oscillation that repeatedly mounted and unmounted weather/effects — widened to `[30, 58]` so the tier has to be genuinely struggling to drop and genuinely comfortable to restore.

See [architecture.md](architecture.md) for the related (non-performance) stability fix to the raycaster/audio bug from the same round.
