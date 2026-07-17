# WindArms — VFX

> V1 section consolidates real, shipped VFX facts already documented elsewhere (cross-referenced, not duplicated at length) — added 2026-07-14 as part of the docs expansion. There is no dedicated V2 VFX brief yet; V2 direction is inherited from [art-direction.md](art-direction.md)'s general Visual Philosophy until something more specific exists.

## V1 VFX (shipped, real)

**Combat VFX** — full detail in [../gameplay/weapons.md](../gameplay/weapons.md):
- Tracers and hit sparks: fixed-size pooled meshes fed by an imperative effects bus (`lib/game/effectsBus.ts`) — zero allocation, zero React re-renders at any fire rate.
- Shell casings: pooled, per-weapon (brass, orange hull for the shotgun), tumble on a simulated arc; the energy weapon vents instead.
- Surface-aware bullet impacts: each map's dominant material (metal/snow/stone/crystal; crates always wood) drives impact spark color, size and lifetime.
- The energy weapon (Ion Lance) has its own full visual identity: thicker/brighter tracer, violet-white "stylized energy" impact overriding surface styling, tinted longer-lingering muzzle discharge.
- Elimination VFX: a ring of sparks at the victim's last known position (with positional boom) plus, from Phase 9, a shockwave ring and light flash.
- Damage feedback: squared-trauma screen shake that decays fast.
- Pooled floating damage numbers (Phase 9 headshot system) — see [../gameplay/weapons.md](../gameplay/weapons.md#headshots--streaks-phase-9).
- Heat-shimmer: a cheap animated-noise pool during sustained automatic fire, `'high'` quality tier only.

**Environmental VFX** — full detail in [../technical/performance.md](../technical/performance.md):
- GPU-driven weather layer (vertex-shader motion, no per-frame CPU buffer rewrite): rain on Cyber City, drifting dust on Forest Temple.
- Real-time reflections on Cyber City's floor (`MeshReflectorMaterial`), `'high'` quality tier only.
- Procedural sky-dome cloud band drift; camera-following haze sprites for cheap "volumetric" ground fog.
- Per-map exposure/contrast grading, plus a persistent gameplay vignette layer over the bloom/SSAO composer.
- Baked per-face vertex-color jitter (`lib/three/variedGeometry.ts`) so flat geometry reads as worn surfaces — zero shader risk, rides `MeshStandardMaterial`'s native `vertexColors`.

**Landing-page VFX** (v1, pre-V2-preview) — full detail in [../technical/architecture.md](../technical/architecture.md): instanced particle fields (embers, rain) mutating a single `BufferAttribute` per frame, smoke canvas-texture billboards, additive light shafts with a lens-flare sprite, HDR bloom/film-grain/vignette composer.

**Known gotcha:** any raycast against a scene containing a visible sprite (muzzle smoke, an impact spark) must set `raycaster.camera` explicitly — `THREE.Sprite.raycast()` dereferences it unconditionally, and a missed assignment silently aborted shots and skipped frame renders in a real, shipped bug. Full writeup: [../technical/architecture.md](../technical/architecture.md#stability-fix-raycasteraudio-bug). Any new VFX system that raycasts against the scene should account for this.

## V2 VFX

No dedicated VFX brief exists yet — the closest thing is the general Visual Philosophy, Lighting, and Weapons sections of [art-direction.md](art-direction.md) (bright/clean/volumetric, HDR skies, "every reload becomes satisfying mechanical choreography"). When v2 combat VFX design starts, check proposals against [../design-principles.md](../design-principles.md) (readable, never feel unfair, work at 60–120 FPS) same as any other mechanic.
