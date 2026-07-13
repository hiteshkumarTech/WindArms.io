# WindArms — Weapons (v1)

> Topic-sliced excerpt of the v1 build. Full context in [../versions/v1.md](../versions/v1.md); nothing here has been reworded. Covers weapon data, viewmodels, and the Phase 9 headshot/visual/geometry work. General combat resolution (server-authoritative hit detection) lives in [mechanics.md](mechanics.md).

## Weapon classes

Seven weapon classes (pistol, SMG, AR, shotgun, sniper, LMG, energy) defined as data in `shared/weapons.ts` — damage, fire rate, magazine, reload, spread, falloff curve, recoil and procedural viewmodel proportions. Client and server import the same definitions, so balance can never drift between them. Fire with LMB, reload with R, switch with 1–7 or the mouse wheel.

## Client feel

Client feel: procedural first-person viewmodels (no external models) with movement bob, look sway, recoil punch, reload dip and switch raise; recoil kicks the camera through an accumulator the controller consumes. Tracers and hit sparks come from fixed-size pooled meshes fed by an imperative effects bus — zero allocation and zero React re-renders at any fire rate. Remote shots replicate with server-resolved endpoints, so every client sees the same tracer geometry. The HUD adds health with damage vignette, hitmarkers, ammo/reload state, a weapon strip and the kill feed; death shows an elimination screen with Space-to-redeploy.

## Headshots & streaks (Phase 9)

Combat feel (Phase 9): hit resolution is now two-zone (head sphere tested before the body capsule) with per-weapon headshot multipliers, backed by pooled floating damage numbers and a dedicated hit marker. Kill streaks (Rampage/Unstoppable/Storm Lord) and multikills (Double/Triple/Quad) get center-screen banners; ending someone else's 5+ streak is called out in the feed.

## Combat polish (Phase 9)

Combat polish: every trigger pull ejects a pooled shell casing (brass, or an orange hull for the shotgun) that tumbles on a simulated arc — skipped for the energy weapon, which vents instead. Bullet impacts are surface-aware: each map carries a dominant material (metal, snow, stone, crystal; crates are always wood) that drives the impact spark's color, size and lifetime, with matching procedurally-synthesized impact SFX, and remote players' shots resolve the right surface too via a short probe raycast. The energy weapon (Ion Lance) has its own visual identity end to end — a thicker, brighter tracer, a violet-white "stylized energy" impact that overrides surface styling entirely, and a tinted, longer-lingering muzzle discharge. A small "Eliminated" confirmation now appears under the crosshair on every kill, distinct from the center-screen streak/multikill banners.

## Visual quality pass (Phase 9)

Visual quality pass: every weapon's `WeaponVisual` grew a `modules` list (`shared/weapons.ts`) — scope/stock/mag/bipod/rail/energy-dressing attachments plus frame/barrel/grip proportions — replacing the old scale-two-numbers-and-done approach, so all seven weapons read as distinct silhouettes. Materials split into worn-metal/matte-polymer archetypes under a shared fresnel rim-light shell; every wall/platform/ramp/crate carries a baked per-face vertex-color jitter (`lib/three/variedGeometry.ts`, riding `MeshStandardMaterial`'s native `vertexColors`, zero shader risk) so flat gray boxes read as worn surfaces; per-map exposure/contrast grading and a persistent gameplay vignette layer on top of the existing bloom/SSAO composer; tracers upgraded from a flat box to a small custom shader with a head-to-tail brightness gradient and a soft round cross-section.

## Weapon geometry overhaul (Phase 9)

Weapon geometry overhaul: the shared chassis builder (`weapons/weaponGeometry.tsx`) layers a lower/upper receiver, a lathe-profiled barrel (collar → taper → muzzle lip, not a flat cylinder) and a per-class `ChassisKind` trim pass — sidearm/compact/balanced/heavy/precision/support/sci-fi — so each weapon has a genuinely distinct silhouette instead of one box with different attachments. Two new material roles (carbon composite, coated ceramic) plus the wear jitter above, now applied to weapon geometry too. Mechanical-action animation — pistol slide, AR charging handle, shotgun pump, LMG feed creep, the energy weapon's self-rotating core/coils — mirrors the existing ammo-feed-module ref pattern, and a cheap animated-noise heat-shimmer pool kicks in during sustained automatic fire (`'high'` quality only). Remote players' held weapons — previously a hardcoded placeholder disconnected from the weapon system — now render the same chassis at a reduced, draw-call-conscious fidelity; `PlayerSnapshot.weapon` was already replicated at 20 Hz and simply wasn't being read for third-person rendering.

## Still open

Still open from the Phase 9 design (tracked in [`../technical/PHASE-9-DESIGN.md`](../technical/PHASE-9-DESIGN.md)): crosshair customization settings (the crosshair already reacts dynamically to fire/movement/hits, it just isn't user-configurable yet).
