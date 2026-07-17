# WindArms — Animation

> Consolidates real, shipped animation facts already documented elsewhere (cross-referenced, added 2026-07-14 as part of the docs expansion). No V2 animation brief exists yet.

## Character animation (v1, shipped)

Remote players render as procedurally rigged hero characters — a 9-node primitive skeleton (hips, torso, head, 2× upper/lower arms, 2× legs) — driven by a pure, unit-tested pose animator (`src/components/game/characters/heroAnimator.ts`, tested in `heroAnimator.test.ts`) instead of bare capsules. See [../gameplay/mechanics.md](../gameplay/mechanics.md#characters-phase-9). No physics-based ragdoll — poses are code-driven functions of the already-replicated `MovementState`, matching the original Phase 9 design intent of a code-driven animation state machine (run cycle, air pose, slide pose, idle sway) documented in [../technical/PHASE-9-DESIGN.md](../technical/PHASE-9-DESIGN.md) F1.

Two silhouettes exist (Gale — slim, Bastion — heavy) with six accent skins, defined in `shared/heroes.ts` and unlocked by account level; see [../gameplay/mechanics.md](../gameplay/mechanics.md#characters-phase-9) for the cosmetic-loadout system this feeds.

## Weapon animation (v1, shipped)

Mechanical-action animation per weapon class — full detail in [../gameplay/weapons.md](../gameplay/weapons.md#weapon-geometry-overhaul-phase-9): pistol slide, AR charging handle, shotgun pump, LMG feed creep, the energy weapon's self-rotating core/coils. Mirrors the ammo-feed-module ref pattern established earlier in Phase 9. First-person viewmodel animation (separate from third-person weapon animation): movement bob, look sway, recoil punch, reload dip, switch raise — see [../gameplay/weapons.md](../gameplay/weapons.md#client-feel).

## Camera/movement animation (v1, shipped)

FOV kick on sprint/dash, eye-height lerp when sliding, camera roll during wall-run (±12° per the original design in [../technical/PHASE-9-DESIGN.md](../technical/PHASE-9-DESIGN.md) F5) — see [../gameplay/mechanics.md](../gameplay/mechanics.md#movement-play).

## Landing-page animation (v1 and V2 preview, shipped)

- V1 landing (currently not the site root — see [../versions/v2.md](../versions/v2.md)): GSAP word-stagger blur-fade, pointer parallax, handheld camera drift. See [../technical/architecture.md](../technical/architecture.md).
- V2 preview landing (currently the site root): scroll-choreographed reveals (`src/components/landing/v2/hooks/useScrollChoreography.ts`, `useReveal.ts`), a dedicated hero animation hook (`useHeroAnimation.ts`), and a boot-sequence preloader (`Preloader.tsx`) that types out lines like *"Initializing Wind Core… Loading Atmospheric Systems… Calibrating Airship Docks… Charging Storm Reactors… Entering Sky Civilization…"* (`BOOT_LINES` in `src/lib/v2/content/hero.ts`) before the page reveals.

## V2 gameplay animation

Not yet designed. When it is, it should build on the v1 pose-animator pattern above (pure, unit-tested, driven by replicated state) rather than inventing a new approach — see [../technical/coding-standards.md](../technical/coding-standards.md) and [../design-principles.md](../design-principles.md) ("readable," "work at 60–120 FPS") for the constraints any new animation system should satisfy.
