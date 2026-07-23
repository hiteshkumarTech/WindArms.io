# VORTEX RIFLE — Production Blueprint

**Status: concept blueprint, not implemented.** This is a design document for a 3D artist, animator, or AI 3D generator to build from — it contains no code and specifies no implementation. Governed by [../art-bible.md](../art-bible.md) (materials, color, wind-tech rules, quality bar) — every choice below is checked against that bible, not invented independently of it.

**Naming conflict, unresolved — read before using this document as final canon:** this blueprint uses the name and rifle classification given in the 2026-07-14 production backlog. It does not yet match `shared/windWeapons.ts`, where "Vortex" is a **carbine** (Veyra Solace's signature weapon, mechanic: *"Turbine spin-up — rate climbs as you hold"*) and the coded **rifle** is "Aeolus Rifle" (Kael Aurin's signature weapon, mechanic: *"Precision spine — tightens while aimed"*). This blueprint keeps the Vortex name and the "turbine spin-up" mechanic (the one piece of real established canon tied to "Vortex") but reclassifies it as a rifle per this backlog's request — that reclassification is a design decision this document is making, not one that was already settled. Log the resolution in [../../decisions.md](../../decisions.md) before treating this as final.

---

## 1. Weapon Identity

**Story.** When the first Wind Temples were raised above the storm, the priority was survival, not war — early wind-turbines existed to power lights, seals, and heat. The Vortex Rifle descends from a *maintenance tool*, not a military design: a compact turbine-driven rivet driver used by the engineers who built the floating structures, adapted over generations into a weapon once the first territorial conflicts between rival Wind Temples began. That maintenance-tool ancestry is still visible in the silhouette — it looks built by engineers first, soldiers second, which is the core differentiator from every "designed as a weapon from day one" rifle in competing games.

**Manufacturer.** Windforge Armory, operating under charter from a Storm Reactor authority (ties the weapon's power source directly to the world's central energy infrastructure — see [../skyfront.md](../skyfront.md)). Windforge is a fictional in-world manufacturer, not tied to any real-world brand.

**Purpose.** Mid-range, high-uptime assault rifle. Designed to reward sustained fire over single-shot precision — the turbine spin-up mechanic means the weapon gets *better* the longer a fight lasts, which is the opposite design philosophy from a burst-precision weapon like the Aeolus Rifle.

**Military role.** Standard-issue frontline weapon for Sky Guard operators — the rifle a new operator is handed first, and the one veteran operators return to when a fight demands raw uptime over finesse. Analogous narrative role to the AK-47/M4A1 in their respective universes: not the "best" weapon on paper, but the one every player recognizes on sight and the one new players are taught on.

## 2. Visual Design

The overall proportions read as a **bullpup-adjacent carbine-length rifle** — the turbine housing sits behind the grip (bullpup-style mass distribution) to keep the weapon short enough for the wall-running, air-dashing movement kit ([../../gameplay/mechanics.md](../../gameplay/mechanics.md)) without a barrel that reads as unwieldy at monumental architectural scale (see the Art Bible §26 Scale Reference — a weapon that looks "toy-sized" against Wind Temple architecture fails the silhouette check).

- **Front:** a short, exposed barrel shroud (Brushed Steel) opening into a compensator ring with three vane slots — visually implies the compressed-air discharge without a traditional muzzle-brake read. The turbine intake is visible just behind the shroud, a circular grille (Titanium) with the Energy Core's cyan glow faintly visible through the slats even when idle.
- **Left:** the primary visual-identity side (per Art Bible §11, an operator's held weapon should be recognizable from the side an opponent sees most in a firefight). A single milled Ancient Alloy accent line runs the full length of the upper receiver, terminating at the ejection port. The magazine well sits forward of the grip, canted 5° forward for a faster reload silhouette.
- **Right:** mirrors the left's structural lines but carries the ejection port (spent-cartridge ejection direction — see §18) and the manual charging lever, a fold-out titanium tab that lies flush against the receiver when not in use.
- **Rear:** the bullpup turbine housing dominates the rear third of the weapon — a ribbed Titanium drum (visually communicating rotation even when static) with a small always-lit Energy Core viewport at its center. The stock is fixed, not folding (see §5 — this is a design choice for read-consistency, not a limitation).
- **Top:** a continuous Picatinny-equivalent rail (in-world name: **spine rail**) running from just behind the front sight base to above the turbine housing, broken only by the manual charging lever's travel path. The iron sight base sits forward, low-profile, always present even when a scope is mounted (per §6, sights are never removed, only supplemented).
- **Bottom:** the magazine well, trigger guard (enlarged slightly beyond real-world proportions for readability at typical FPS camera distance), and a single accessory rail stub for underbarrel attachments (grip, foregrip stabilizer).
- **Perspective Hero View:** three-quarter front-left, camera slightly below the weapon's centerline (looking "up" at it) — the angle used on the concept board itself and in [../art-bible.md](../art-bible.md) §25's composition rules (foreground weapon large and grounded, monumental scale implied even in a weapon-only shot via the depth of field and implied structure reflected in the Glass Crystal components).

## 3. Material Breakdown

Cross-referenced against the Art Bible's six-material library ([../art-bible.md](../art-bible.md) §5) — every part maps to an existing material or is flagged as a proposed extension.

| Material | Application | Art Bible mapping |
|---|---|---|
| **Ceramic** | Heat-shedding plates along the barrel shroud and turbine housing exterior — matte, slightly rough, off-white | New to the bible's 6-item list, but directly consistent with v1's real "coated ceramic" material role ([../../gameplay/weapons.md](../../gameplay/weapons.md#weapon-geometry-overhaul-phase-9)) — propose formalizing "Ceramic" as a 7th bible material rather than treating it as a one-off. |
| **Titanium** | Receiver, charging lever, turbine drum, rail system | Direct match, Art Bible §5 |
| **Carbon Fiber** | Handguard shell, stock shell (structural core is Titanium; carbon fiber is the outer skin) — matte black-gray, visible weave at close inspect range | New to the bible's 6-item list; propose as a 2nd new addition — carbon fiber's role (lightweight non-structural skin) is distinct enough from Titanium/Brushed Steel that it shouldn't be folded into either. |
| **Wind Energy Core** | The central cyan-glowing cell visible through the rear turbine viewport and faintly through the front intake grille | Direct match to **Energy Core**, Art Bible §5 |
| **Glass** | The turbine viewport (rear) and a small pressure gauge inset into the left receiver face | Reads as a variant of **Glass Crystal** (Art Bible §5) — same material family, functional (viewport) rather than structural (canopy) application |
| **Rubber** | Grip texture panels (pistol grip, foregrip), charging-lever pull tab | New — functional, non-structural, small surface area. Not a bible-level material, more a finishing detail; doesn't need bible extension. |
| **Fabric** | A single sling-mount strap loop, woven in a dark storm-blue — the only fabric element on the weapon, kept deliberately minimal since this is a maintenance-tool-turned-weapon, not a soldier's kit-heavy rifle | New — minimal use is intentional, see §1 story |
| **Metallic Paint** | A thin worn-edge coat over the Titanium receiver — NOT a uniform paint job. Per Art Bible §5's vertex-color-jitter guidance, this should read as *worn at edges, intact in recesses* — implying real field use, not a factory-fresh coat | Applies the Art Bible's "weathered, not showroom-new" rule (§5) directly to a weapon for the first time in the doc set |

**Proposed Art Bible update:** Ceramic and Carbon Fiber should be added as materials 7 and 8 in [../art-bible.md](../art-bible.md) §5 rather than treated as one-off exceptions for this weapon alone — flag for the user, don't silently expand the bible from a weapon-level document.

## 4. Color Palette

Every color below is a `STORM` token ([../art-bible.md](../art-bible.md) §4) — no unlisted hex values, per the Art Bible's hard rule.

| Element | Token | Hex |
|---|---|---|
| Receiver, rail, primary structure | `steel` | `#8E99A4` |
| Turbine housing, barrel shroud | `slate` | `#3E4A5A` |
| Ancient Alloy accent line | `gold` | `#E3A23C` |
| Energy Core glow (viewport, intake) | `energy` | `#4FC3FF` |
| Worn-edge highlight (paint chipping to bare metal) | `mist` | `#C7CFD6` |
| Ceramic heat-shield plates | `marble` | `#EDEAE3` |
| Deep recesses, shadowed mechanism gaps | `abyss` | `#0A1522` |

This is deliberately **not** operator-tinted — the base Vortex Rifle uses a neutral steel/slate/gold palette so that operator weapon-tints (the real, shipped `WEAPON_TINTS` system in `shared/heroes.ts` — default/ember/violet/jade/rose/gold) have a neutral canvas to apply over, consistent with how v1's tint system already works ([../../gameplay/mechanics.md](../../gameplay/mechanics.md#characters-phase-9)).

## 5. Dimensions

| Spec | Value | Notes |
|---|---|---|
| Overall length | 68 cm | Short for a rifle-class weapon — deliberate, see §1 (bullpup mass distribution, movement-kit compatibility) |
| Barrel length | 22 cm | Exposed shroud portion; actual barrel is shorter, shroud extends it visually |
| Height (receiver to rail top) | 24 cm | Includes iron sight base |
| Width | 6 cm | Excludes underbarrel attachments |
| Weight (unloaded) | 3.1 kg | Lighter than the visual mass suggests — a wind-tech justification (Titanium/Carbon Fiber construction, no traditional gunpowder-cartridge weight) worth stating explicitly so weapon-feel design (ADS speed, sprint-to-fire time) isn't accidentally anchored to real-world AR-pattern weights |
| Magazine capacity (standard) | 30 rounds | Matches v1's balance philosophy of ~0.3–0.8s TTK ranges ([../../gameplay/weapons.md](../../gameplay/weapons.md)) — not a final balance number, a plausible starting point for whoever tunes it |

**Three different numbers are all called "scale" for this weapon — don't conflate them:**

| Term | Value | What it means | Source of truth |
|---|---|---|---|
| Physical dimension | 68 cm overall length | The blueprint's real-world size claim (this table, above) | This document |
| Physical engine scale | `0.68` | A *rendering scale factor*, not a dimension — 68 cm ÷ the runtime GLB's exporter-normalized 1.000 m long axis. Used wherever the weapon needs to read at true, physically-plausible size (e.g. a future third-person/world-placed context) | `src/lib/v2/weapons/visualConfigs.ts` |
| Hero-display scale | `2.9` | Presentation-only, landing-page hero stage — ≈85% of the `ProceduralAeolus` fallback's screenshot-approved footprint. Deliberately monumental, not physically accurate | `visualConfigs.ts` (`vortex.scale`), derivation in `docs/decisions.md` 2026-07-17 |
| First-person viewmodel scale | `0.42` | Presentation-only, shared `/v2/range` + `/v2/play` FP camera framing — tuned independently of both numbers above, identical in the hip and ADS poses (no scale "zoom" on ADS) | `vortexViewmodelPose.ts`'s `VORTEX_VIEWMODEL_POSES.hip.scale`/`.ads.scale` (Milestone 6 polish pass moved this out of `VortexViewmodel.tsx`'s old `VIEWMODEL_SCALE` constant into a typed pose config — see [decisions.md](../../decisions.md) "Vortex Rifle FP pose correction") |

All three engine-side numbers are unrelated multipliers applied to the *same* underlying 1.000 m-normalized GLB — none of them is "more correct" than the others; each is tuned for its own context and none should be reused across contexts without re-deriving it the way `visualConfigs.ts`'s comment shows.

## 6. Attachment System

Mapped against the real, shipped `WeaponModuleKind` enum (`shared/weapons.ts`) wherever a compatible module already exists — this keeps the blueprint implementable without contradicting existing code. New module kinds needed beyond the current enum are flagged explicitly.

| Category | Compatible existing module kinds | New kinds this weapon needs |
|---|---|---|
| **Scopes** | `ironSight` (default, always present per §2), `redDot`, `scope` | — |
| **Suppressors** | `compensator` (default), `choke` | A true energy-suppression module ("dampener") isn't in the current enum — proposed new kind: `dampener`, vents turbine noise through a ceramic baffle rather than a traditional suppressor can |
| **Magazines** | `stickMag` (default 30-round), `drumMag` (extended) | — |
| **Stocks** | `soloStock` (fixed, default per §2's "not folding" choice), `cheekRest` | — |
| **Grips** | Not in current enum as a distinct category (v1's system covers this via chassis proportions, not modules) | Proposed: `foregrip`, `verticalGrip` as new module kinds if V2 wants explicit grip attachments as a visual customization axis |
| **Barrels** | `railHandguard`, `barrelShroud` | — |
| **Energy Modules** | `crystalCore` (default Wind Energy Core), `coil`, `ventFin` | A tunable "overcharge" module (trades turbine spin-up rate for heat buildup) isn't in the current enum — proposed new kind: `overchargeCoil` |

**Note for whoever implements this:** three new module kinds are proposed (`dampener`, `foregrip`/`verticalGrip`, `overchargeCoil`) — these require an addition to `shared/weapons.ts`'s `WeaponModuleKind` union before they can be built, not something a 3D artist can add unilaterally. Flag to engineering before modeling these specific attachments.

## 7. Mechanical Breakdown

Every moving part, and how it functions within the "no magic, real wind-tech" rule ([../lore.md](../lore.md)):

1. **Turbine core (rear housing):** a sealed, continuously-spinning micro-turbine drawing ambient atmospheric pressure differential (the same principle described for Storm Reactors — [../skyfront.md](../skyfront.md)). At rest, it idles at low RPM (visible as a slow glow-pulse in the Energy Core viewport, not a visible spin — the blades are behind glass and moving too fast to read individually at idle).
2. **Firing trigger → pressure valve:** pulling the trigger doesn't ignite anything — it opens a valve releasing stored compressed air from the turbine's reservoir through the barrel, behind a kinetic slug. This is the physical basis for "kinetic rounds powered by compressed wind" (`windWeapons.ts`'s Aeolus description, reused here as the general wind-weapon firing principle).
3. **Turbine spin-up (the signature mechanic):** sustained trigger-hold increases turbine RPM, which increases the pressure differential available per shot, which increases fire rate — visually, the Energy Core viewport's pulse rate visibly climbs, and a rising pitch is audible (see §15). This directly implements `windWeapons.ts`'s stated mechanic for "Vortex": *"Turbine spin-up — rate climbs as you hold."*
4. **Charging lever (right side, fold-out):** manually re-primes the pressure valve after a jam or cold-start — a maintenance-tool holdover (§1), not needed in normal fire but functionally present for the reload-jam animation beat (§8).
5. **Magazine feed:** conventional mechanical feed (a spring-fed follower) — the *kinetic slug* is mechanically fed, only its propulsion is wind-powered, not the feed mechanism itself. This keeps the reload silhouette familiar/readable rather than requiring an entirely new reload grammar.
6. **Ejection port valve:** each fired round vents its spent pressure cartridge (see §18) through a one-way valve timed to the turbine's rotation — this is why ejection rate audibly tracks fire rate rather than being a fixed mechanical clack.

## 8. Reload Animation Breakdown

Beats, timed for a ~2.2s reload (consistent with v1's real reload-time range across its 7 weapons — [../../gameplay/weapons.md](../../gameplay/weapons.md)):

1. **0.0–0.3s:** support hand releases the foregrip, moves to the magazine release (integrated into the forward-canted mag-well design from §2 — the release is a lever, not a button, for readability at FPS-viewmodel scale).
2. **0.3–0.7s:** spent magazine drops free — falls out of frame, no catch animation (keeps the beat fast).
3. **0.7–1.3s:** new magazine inserted at the forward cant angle, seated with a single decisive push (no double-tap-to-seat — this is a maintenance tool, insertion should read as practiced and efficient, not fumbled).
4. **1.3–1.7s:** support hand moves to the charging lever (§7.4), pulls once — this is the "wind-tech tell" that separates this reload from a generic AR reload: the weapon needs a manual re-prime, not just a bolt-release.
5. **1.7–2.2s:** support hand returns to foregrip; weapon settles from the reload's slight downward dip back to ready height (ADS-ready pose).

## 9. Inspect Animation

~4s loop, triggered manually (not automatic — a deliberate player action, consistent with genre convention). Beats: weapon rotates to show the left face (§2's "primary visual-identity side") first, camera-relative — the Ancient Alloy accent line catches light as it rotates. At the 2s mark, the operator's off-hand thumb flicks the pressure gauge (§3, Glass) — the gauge needle moves, communicating "this is a real, functioning machine, not a prop" without any UI. At 3s, weapon rotates back to ready position. No dialogue, no voice line tied to this specific inspect (keep it silent — let the mechanism read on its own).

## 10. Idle Animation

Subtle, breathing-synced sway (matches v1's real viewmodel-bob pattern — [../../gameplay/weapons.md](../../gameplay/weapons.md#client-feel)) plus a **turbine idle-pulse**: the Energy Core viewport glow brightens and dims on a slow ~2.5s cycle even when not firing, communicating the turbine never fully stops (§7.1). This is the single most important idle detail — it's what makes the weapon read as "alive" rather than a static prop between shots, and it should be present in both first-person and third-person renders.

## 11. Sprint Animation

Weapon lowers and cants inward toward the operator's centerline (standard genre convention — deliberately *not* reinvented here, since sprint-weapon-visibility is a solved, expected FPS grammar and novelty here would only hurt readability). The one WindArms-specific beat: the idle-pulse (§10) speeds up during sprint, implying the turbine spins faster under exertion/movement-linked airflow — a small detail that ties the weapon's "alive" quality to the momentum-based movement pillar ([../art-bible.md](../art-bible.md) §19).

## 12. ADS Animation

~0.18s transition (fast — the weapon's light Titanium/Carbon Fiber construction, §5, justifies a snappier ADS than a heavier real-world equivalent). The iron sight (or mounted optic) rises into frame; the turbine idle-pulse (§10) noticeably slows and steadies the instant ADS engages — visually reinforcing the real mechanic (`windWeapons.ts`'s Aeolus description "tightens while aimed" is Aeolus-specific, but a steadying visual cue on ADS is a reasonable shared grammar across the wind-weapon family; if reserved as Aeolus-exclusive, cut this beat for Vortex and keep only the transition speed).

## 13. Fire Animation

Per-shot: minimal muzzle rise (recoil is turbine-pressure-based, not chemical-propellant-based — see §14), a fast ceramic-plate heat-shimmer emerges after ~8 consecutive shots (ties to v1's real heat-shimmer VFX pattern, `'high'` quality tier only — [../vfx.md](../vfx.md)). Sustained fire visibly accelerates the turbine glow-pulse (§7.3) shot-by-shot — this is the primary visual feedback for the spin-up mechanic and should be unmistakable without a HUD indicator.

## 14. Recoil Pattern

Vertical-dominant with a slight rightward drift (right-handed viewmodel default), tightening — not loosening — the longer a burst continues. This is the recoil-side expression of the turbine spin-up mechanic: higher turbine RPM feeds a more consistent, better-regulated pressure release per shot, so late-burst shots should recoil *less* than early-burst shots, inverting the usual "recoil gets worse over a burst" genre convention. This is the weapon's core skill expression (per [../../design-principles.md](../../design-principles.md)'s "reward skill" checklist item) — a player who holds a controlled burst is rewarded with a tightening pattern, not punished with a worsening one.

## 15. Sound Design Notes

Built on the Art Bible's five confirmed audio categories ([../art-bible.md](../art-bible.md) §21), applied specifically to this weapon:

- **Turbine Spin:** a rising-pitch whine underlying sustained fire, directly audible feedback for §7.3's spin-up mechanic — this should be the weapon's most distinctive, recognizable sound (the "AK-47 sound" equivalent — the one audio cue that identifies this weapon blind).
- **Pressure Release:** the actual "shot" sound — a sharp, compressed *chuff* rather than a gunpowder crack. No traditional muzzle "bang."
- **Electromagnetic Crack:** a subtle, secondary layer on the pressure release, present but quieter than on the Energy weapon family (per v1's Ion Lance precedent, [../../gameplay/weapons.md](../../gameplay/weapons.md)) — this is a kinetic weapon, not a pure-energy weapon, so this layer should read as a texture, not the primary identity.
- **Wind Resonance:** ambient, audible only at close range or in a quiet moment — the idle turbine hum (§10).
- **Storm Ambience:** not weapon-specific, environmental — noted here only to confirm this weapon doesn't need to fight the environment's audio layer for space; its frequency range (§ above) should sit above typical storm-ambience low-end.

Following v1's proven technical approach (100% procedural Web Audio synthesis, [../audio.md](../audio.md)) is the recommended implementation path, not sourced/recorded audio.

## 16. Particle Effects

Pooled, zero-allocation, following v1's real effects-bus architecture ([../vfx.md](../vfx.md)): muzzle discharge puff (compressed air, not smoke — pale, fast-dissipating, tinted faintly `energy`-blue at the core), heat-shimmer during sustained fire (§13), a brief Energy Core flare on turbine spin-up reaching max RPM (a one-time "kicks into high gear" visual beat, not a per-shot effect).

## 17. Muzzle Flash

Deliberately understated compared to a gunpowder weapon — no bright yellow-orange flash. Instead: a small, fast `energy`-blue-white flash concentrated at the compensator vanes (§2), reading as a pressure-release event rather than a combustion event. This is a hard differentiator from every real-world-inspired competing shooter's muzzle flash and should not be diluted toward a generic orange flash for "genre familiarity" — the Art Bible's "avoid military realism" rule (§28) applies directly here.

## 18. Shell Ejection

Not brass. Per §7.6, ejects a small pressurized **spent air-cartridge** — a compact cylinder (roughly a third the size of a traditional rifle casing, since it holds compressed air rather than propellant + projectile) — matte Titanium-gray, no brass shine. Ejects right side, timed to fire rate (faster ejection cadence as turbine RPM climbs, §7.3). Follows v1's real pooled shell-casing pattern technically ([../vfx.md](../vfx.md)) but with new geometry/material reflecting the different in-world object.

## 19. Wind Energy Effects

The weapon's signature visual thread, tying every other section together: the Energy Core viewport pulse (idle, §10), the spin-up glow acceleration (fire, §13), the ADS steadying cue (§12), and the muzzle flash's energy tint (§17) are all expressions of one underlying system — the turbine's real-time RPM — rather than independent effects. Anyone implementing this weapon should drive all four from a single "turbine RPM" value rather than tuning them as separate unrelated animations, so they stay physically consistent with each other automatically.

## 20. Lore

The Vortex Rifle's maintenance-tool ancestry (§1) is its defining lore hook: unlike a weapon designed for war from its first blueprint, the Vortex carries visible evidence of its origin — the forward-canted magazine well was originally a fastener hopper; the fixed stock (§5) is a holdover from a tool that needed to sit steady against a work surface, not shoulder recoil. Operators who carry it are making a statement distinct from carrying the Aeolus Rifle (a purpose-built military weapon): the Vortex says "I came from the people who built this civilization, not just the people defending it." This should inform any future operator-bio work that pairs an operator with this weapon as their signature — see [../../gameplay/operators.md](../../gameplay/operators.md) for the real operator-bio format to follow if this weapon is assigned to a specific operator.

## 21. Manufacturing Details

Windforge Armory (§1) produces the Vortex Rifle in small, decentralized workshops attached to individual Wind Temples rather than one centralized factory — consistent with the world's floating-megacity structure ([../skyfront.md](../skyfront.md)) where no single location can safely house all production. This explains minor, in-world-acceptable cosmetic variance between individual rifles (slightly different wear patterns, §3's weathering) without breaking silhouette consistency (§24) — a worldbuilding justification for weapon-skin variation that's consistent with, not contradictory to, a future cosmetic/skin system.

## 22. First Person View

Viewmodel proportions should read larger/more detailed than the third-person model (standard FPS convention, matches v1's real approach — [../../gameplay/weapons.md](../../gameplay/weapons.md#client-feel)) — the Energy Core viewport, pressure gauge, and Ancient Alloy accent line (all called out above as key identity details) must be legible at first-person viewing distance, since that's where a player spends the most time looking at this weapon.

## 22a. Grip-Anchor Authoring System (Milestone 7, Phase F, Step 5, 2026-07-21)

Weapon-owned right-hand (primary/trigger) and left-hand (support/foregrip) target transforms — the future two-bone IK layer's authoritative targets once Kael's FP arms are mounted. **Not IK, not arm-mounting** — this step builds and validates the target system only; the rifle is not yet held. Implementation: `src/lib/v2/weapons/runtimeAnchorMath.ts` (pure transform math), `src/lib/v2/weapons/gripWorldPose.ts` (generation-safe world-pose bridge), `src/lib/v2/weapons/vortexRuntimeAnchors.ts` (`gripHandLocal`/`gripSupportLocal` constants + the full `RuntimeGripAnchor` coordinate contract, documented in that file's doc comments — read it before touching a value here).

**Coordinate contract summary** (full version lives in `vortexRuntimeAnchors.ts`): position in raw-model-local meters (X-long/muzzle+X, Y-up, Z-lateral, same space as `muzzleLocal`); rotation in radians, XYZ Euler order, weapon-local; the composed quaternion's local +X/+Y/+Z represent hand-forward/thumb-side/palm-normal respectively — the same basis `tools/blender/inspect-kael-hand-basis.py` measures on Kael's actual `mixamorig:LeftHand`/`RightHand` rest-pose bones, so a future IK consumer can compare the two directly.

**CANONICAL values, finalized 2026-07-21** (`vortexRuntimeAnchors.ts`, `VORTEX_RUNTIME_ANCHORS`) — visually calibrated in `/v2/range?grips=1` (`VortexGripTunerPanel`/`VortexGripAnchorDebug`) with axes, palm proxies, and Kael-hand-basis proxies enabled, against the real Vortex Rifle LOD1, checked across hip-fire, ADS, single-shot, sustained fire, recoil recovery, reload, inspect, and movement sway:

| Anchor | Position (m) | Rotation (rad, XYZ) | Rotation (authoring °, Z) |
|---|---|---|---|
| `gripHandLocal` (right, primary) | `[-0.25, -0.065, 0.0]` | `[0.0, 0.0, -1.1519]` | -66° |
| `gripSupportLocal` (left, support) | `[0.22, -0.05, 0.0]` | `[0.0, 0.0, -0.5061]` | -29° |

`gripHandLocal` sits centered around the pistol grip with a believable wrist angle; `gripSupportLocal` sits at the forward support/handguard region, behind the muzzle (x=0.47), not overlapping the right hand. Both refine the same measured/estimated positions from the provisional pass (§ below still records that provenance) rather than targeting different geometry. **These are TEMPORARY RUNTIME PROXIES, not authored GLB sockets** — same status as `muzzleLocal`. A future Blender-authored v1.0 pass should replace them with real `socket_grip_hand`/`socket_grip_support` empties (`manifest.ts`'s `plannedSockets`). Kael's arms are still not mounted and no IK exists — **do not read this table as "the rifle is held."**

Superseded provenance (kept for the record, not the current status): `gripHandLocal`'s provisional position came from a real geometric measurement (a cross-sectional scan of the decompressed LOD1 mesh found the pistol grip's Y-min dip bottoming out at x≈-0.258, y≈-0.135 against a y≈-0.060 receiver baseline); `gripSupportLocal`'s provisional position was an ergonomic estimate (the handguard there is a near-uniform cylinder with no comparable geometric signature); both provisional rotations were explicitly-flagged starting estimates, not visually verified. All four values above have since been checked against the running scene and are no longer estimates.

**World-pose lifecycle.** `gripWorldPose.ts` publishes both hands' world position/quaternion atomically every frame from `VortexViewmodel.tsx` (mirrors the proven `muzzleWorldPose.ts` bridge but adds a generation counter — see `docs/decisions.md`'s "Grip world-pose generation algorithm" entry for why a plain `ready` flag wasn't enough here). Publishing runs unconditionally in both `/v2/range` and `/v2/play` (same as the muzzle bridge already does). **Now consumed by `KaelFirstPersonArms` in both scenes** (§22b, added 2026-07-21/22) in addition to the dev authoring tool; the debug UI itself remains `/v2/range`-only.

**Known limitation carried over from §22, now partially resolved by §22b:** the rifle was a corrected floating viewmodel, not a physically held one — this step (Step 5) added trustworthy hand *targets* without attaching hands to them. §22b (Step 6) is the two-bone IK + Kael FP-arms mounting that closes that gap, now live in both `/v2/range` and `/v2/play` — see §22b for what remains (visual calibration).

## 22b. Kael FP-Arm IK — `/v2/range` AND `/v2/play` (Milestone 7, Phase F, Step 6, 2026-07-21; extended to `/v2/play` 2026-07-22)

Kael's real first-person arms derivative (`operator-kael-arms.glb`) now solves toward §22a's grip targets every frame in **both** `/v2/range` and `/v2/play` — both hands visibly grip the rifle and follow it through hip-fire/ADS/movement/recoil/reload/inspect. The `/v2/play` mount uses the exact same `KaelFirstPersonArms` component as `/v2/range`, unmodified — no play-specific fork exists (`docs/decisions.md`). **Not visually calibrated** (no browser/live-render access this session — every value below is a structurally-validated first pass, not a tuned final).

**Visibility blocker found and fixed (2026-07-22).** Manual browser testing reported the arm MESH invisible in both `/v2/range` and `/v2/range?ik=1`, despite the debug tuner/weapon/axes/pole-line all rendering. Root cause, confirmed via a headless trace of the real GLB (no browser needed): `operator-kael-arms.glb`'s skeleton is authored in full-body character space (hips ~y=1.06m, shoulders ~y=1.52m — the same "feet at origin" convention as the body derivative), not shoulder/camera-relative, and the arm-rig mount never corrected for that — placing both the rendered mesh and the IK solver's own shoulder reference ~1.5m above the camera. Fixed with a mount-time-only recentering (`recenterArmMetrics()` in `kaelArmRig.ts`, applied to both the cached IK metrics and the mesh instance's own position, using one shared anchor) — full root-cause and rejected-alternatives writeup in `docs/decisions.md`. Verified via 6 new unit tests plus a headless end-to-end simulation against the real asset (post-fix shoulder sits 0.176m from a simulated camera, not ~1.5m; the mesh's world bounding box straddles simulated camera height; an IK solve reaches a plausible grip target exactly). **Still not confirmed in an actual browser** — this fix is verified structurally (tests, a real-asset headless simulation, clean compilation) but the arms have not yet been SEEN rendering correctly by a human or automated screenshot.

**Transform ownership (absolute rule, structurally enforced).** `VortexViewmodel.tsx` owns 100% of the weapon's hip/ADS/sway/bob/recoil/reload/inspect transform chain, unchanged by this step. Kael's arms never move the weapon: the arm-rig container follows the camera every frame for COARSE shoulder placement only (position + a small static offset, `shoulderRootOffset`) — it deliberately does NOT reproduce the weapon's own hip/ADS/recoil/sway/bob motion (that would double-motion against the grip targets it's solving toward). Every frame, the rig reads (never recomputes) `gripWorldPose.ts`'s published right/left hand world targets and solves the two-bone chain toward them.

**Hierarchy.** `KaelFirstPersonArms.tsx` — a standalone component, not built on the general operator-rig architecture (`FirstPersonOperatorRig`/`operatorArmsSlot`), which is shaped for a different job and shared by several other consumers; full reasoning in `docs/decisions.md`. Resolves the arms slot via the normal pipeline (`operatorArmsSlot('kael')`, no hardcoded URL), clones the skeleton once per mount (`SkeletonUtils.clone`), resolves bones with a Mixamo-name-normalizing fallback (`kaelArmRig.ts`), and falls back to omitting arms entirely (never a crash, never procedural replacement arms) on a missing asset or missing critical bone.

**IK algorithm.** Pure analytic two-bone (law-of-cosines) solver, `src/lib/v2/operators/ik/twoBoneIk.ts` — closed-form, single-pass, no iteration. Orientation is a delta-rotation from each bone's measured REST world quaternion/direction (same technique as `runtimeAnchorMath.ts`'s hand-basis correction), not an assumed bone-local axis — required since Kael's own two hands don't share one (below). The elbow pole is a fixed DIRECTION in container-local space, not a world point — chosen specifically so the elbow's bend side can never flip as the target moves close to the shoulder (full reasoning: `docs/decisions.md`).

**Measured rest metrics** (`kaelArmRig.ts`'s `measureArmRestMetrics`, run ONCE per mounted skeleton, never per frame): shoulder/elbow/hand positions, upper/lower bone lengths, rest quaternions/directions, and — independently per side — a hand-basis correction quaternion, all cached relative to the arm-rig container's own local frame and reprojected into world space each frame via cheap operations. The skeleton is never traversed per frame.

**Elbow-pole config and shoulder offset** (`firstPersonArmIkConfig.ts`, `FIRST_PERSON_ARM_IK_CONFIG` — first-pass values, NOT visually tuned):

| Field | Value |
|---|---|
| `rightElbowPoleLocal` | `[0.55, -0.75, 0.35]` |
| `leftElbowPoleLocal` | `[-0.5, -0.78, 0.32]` |
| `shoulderRootOffset` | `[0.0, -0.05, 0.0]` |
| `maxReachRatio` | `0.97` |
| `positionWeight` / `rotationWeight` | `1.0` / `1.0` |

**Hand-basis corrections (both sides, independently measured — never mirrored).** Confirms in running code what `inspect-kael-hand-basis.py` already proved on the static rest pose: Kael's left and right hand bones do NOT share a mirrored local-axis convention (X axes oppose cleanly at -0.9946, Y/Z do not, at 0.7473/-0.7419). `kaelArmRig.ts` measures each hand's own finger-forward/thumb/palm-normal directions from its own bones (Hand/Thumb1/Index1/Pinky1 world positions, cross-product palm-normal, Gram-Schmidt-orthogonalized against finger-forward before deriving thumb algebraically) and derives that hand's correction quaternion independently — never negating one side's value to produce the other's, per the same rule already established for §22a's grip anchors.

**Finger poses (both sides, `firstPersonArmIkConfig.ts`'s `RIGHT_HAND_FINGER_POSE`/`LEFT_HAND_FINGER_POSE`) — explicitly temporary, not final animation.** Right hand: middle/ring/pinky wrap the grip (curl 0.85–0.9 near the base segment), thumb rests naturally (0.15–0.35), index stays near the trigger guard rather than curling with the rest (0.15–0.25). Left hand: all five fingers wrap the handguard (curl 0.55–0.8 across segments). Applied as typed per-bone-segment offsets after the arm/hand IK solve — no procedural grip solver, per the milestone's own explicit instruction that one isn't required at this stage.

**Reload/inspect IK weight behavior** (`firstPersonArmWeights.ts`) reuses the EXISTING `vortexWeaponStore` reload/inspect timers — no new competing state machine, no duration change to either action (purely a visual blend). Idle/hip-fire/ADS/firing/recoil/sprint: both hands at weight 1 (fully attached). Reload: left (support) hand eases down to weight 0.15. Inspect: left hand eases to weight 0.3. Both ease via `1 - exp(-8·Δt)` (smooth, frame-rate-independent), never snap.

**`/v2/range`-only dev tooling — `?ik=1`.** Same contract as §22a's grip tuner: `process.env.NODE_ENV !== 'production'` checked BEFORE the query-param read (not bypassable in production), panel edits a clone of the shipped config, canonical values stay source-controlled, "copy code" is manual. `KaelArmIkDebug.tsx` (3D shoulder/elbow/hand/target/pole markers + chain line per side), `KaelArmIkTunerPanel.tsx` (DOM panel — pole X/Y/Z both sides, shoulder offset, marker/chain-line toggles, freeze-pose, copy-code). Disabled by default; zero cost when off.

**Fallback behavior — never a crash, never a procedural replacement, never a moved weapon.** Missing arms asset, missing critical bone (`MissingCriticalBoneError`), a not-yet-ready grip-pose generation, or a non-finite IK result on EITHER arm each result in the whole rig being hidden for that frame (`container.visible = false`) with a dev-only once-per-key console warning — Vortex Rifle shooting/match state is never affected by any of these paths, confirmed by an independent review that specifically traced every one of these code paths before this pass was reported complete.

**Performance (reasoned from the GLB inspector + code structure, not live-profiled — no browser access).** `operator-kael-arms.glb`: 65 joints, 19,996 tris, 1 material (`Kael_Dev_Neutral`, temporary neutral dev material, no embedded textures), well inside the arms budget (21,000 tris). One `SkeletonUtils.clone` per mount (shares geometry/materials with the pipeline's cache, nothing extra to dispose on unmount), one `useFrame` for the whole rig (not per-bone), two IK solves per frame (one per arm) at a fixed, small per-solve cost (closed-form, no iteration), and — after the review's allocation fixes — no `Vector3`/`Quaternion` allocation anywhere in the per-frame path when scratch objects are supplied, matching this codebase's zero-alloc hot-path convention. No `AnimationMixer` is created (no clips exist yet for this derivative). A live draw-call count and an actual five-restart memory/instance-count stress test are NOT verified this pass (would require a browser); the structural reasoning above (single clone, single frame hook, no per-frame allocation, resources owned by the pipeline's `useGLTF` cache) is the basis for expecting no leak, not a measurement.

**Known limitations, carried forward or new this pass:**
- **Not visually calibrated.** Elbow-pole values, shoulder offset, and finger-curl appearance are first-pass structural defaults, not tuned against the rendered scene — this session had no browser/live-render access. `?ik=1`'s tuner exists precisely to correct this without re-guessing-and-committing blind.
- **Neutral dev material, not final.** `operator-kael-arms.glb`'s single material has no embedded textures — carried over unchanged from the arms-extraction gate (`docs/forge/kael-v0.1-inspection.md`), not something this pass could or did address.
- **No animation clips exist yet** for the arms derivative — reload/inspect/sprint arm presentation is IK-weight-blend only (§ above), not a distinct authored animation, consistent with the milestone's explicit "reload/inspect stay temporary/procedural" instruction.
- **Finger grip poses are a fixed per-bone offset, not a contact-aware solver** — explicitly acceptable per the milestone's own instructions at this stage, but will not adapt to weapon geometry changes automatically.
- **Potential clipping between the arm mesh and the weapon or the character's own torso is unverified** — no live render to check against.
- **`/v2/play` now has Kael's arms too (2026-07-22), same component as `/v2/range`, unmodified.** What's still open for both scenes equally is visual calibration, not integration — see the top of this section.

## 23. Third Person View

Reduced-fidelity chassis reusing the same base geometry at lower draw-call cost, per v1's real established pattern for remote-player held weapons ([../../gameplay/weapons.md](../../gameplay/weapons.md#weapon-geometry-overhaul-phase-9)) — this is not a separate model, it's the same chassis at reduced fidelity, exactly matching how v1 already solved this problem for its own weapons.

## 24. Silhouette Design

Must pass the Art Bible's readability requirement (§11, §29): recognizable at combat distance from silhouette alone. The Vortex Rifle's silhouette-defining features, in priority order: (1) the rear bullpup turbine drum — the single largest, most distinct mass on the weapon, unlike any other weapon in the family; (2) the forward-canted magazine — a diagonal line no other WindArms weapon shares; (3) the short overall length relative to its visual bulk. A player should be able to identify "that's a Vortex Rifle" from the rear-turbine-drum silhouette alone, even in a nose-on or heavily obscured view.

## 25. Optimization Notes (Three.js / React Three Fiber)

Must follow the real, established v1 technical patterns — this is not optional stylistic guidance, it's how the actual rendering budget stays sane:

- **Primitive-first geometry**, no imported meshes, following the real chassis-builder pattern (`weapons/weaponGeometry.tsx`, [../../technical/architecture.md](../../technical/architecture.md)) — this weapon should use the existing `ChassisKind` trim-pass system, likely `'balanced'` given its mid-range role (§1), not a new one-off geometry pipeline.
- **No texture maps for base materials** — colors and wear (§3, §4) are driven by `MeshStandardMaterial` properties plus the existing baked vertex-color-jitter technique ([../../technical/architecture.md](../../technical/architecture.md)), consistent with the zero-asset-by-default pipeline ([../../technical/asset-pipeline.md](../../technical/asset-pipeline.md)).
- **Real assets are optional, not required** — if a GLB model is ever produced for this weapon, it should be wired through the existing `artSlot` + resolver pattern ([../../technical/asset-pipeline.md](../../technical/asset-pipeline.md)), degrading gracefully to the procedural chassis if absent. Suggested art slot id: `vortex-rifle`.
- **VFX via the existing pooled effects bus** (§16–19) — zero per-frame allocation, reusing `lib/game/effectsBus.ts`'s established pattern rather than a new system.
- **Third-person LOD** per §23 — do not model a full-detail third-person version; reuse the reduced-fidelity chassis pattern already proven in v1.
- **Quality-tier gating:** the heat-shimmer effect (§13) should be `'high'`-tier only, following the exact precedent already set for v1's existing heat-shimmer pool ([../../technical/performance.md](../../technical/performance.md)).

## 26. References

Inspiration for *function and feel* (rate-of-fire escalation under sustained pressure, bullpup mass distribution for mobility, tactile reload grammar) drawn from the general modern-military-shooter vocabulary established by Call of Duty, Apex Legends, The Finals, Battlefield, and Destiny 2 — specifically their shared convention that a "signature rifle" must read instantly and function as a skill-expressive default weapon. No specific weapon model, texture, sound file, or silhouette from any of those games is referenced or should be copied — per the Art Bible's explicit rule (§3, §28) against copying named-franchise visual identity. Every material, mechanism, and visual beat in this document traces to WindArms's own wind-technology vocabulary (§2, §7, §9 of [../art-bible.md](../art-bible.md)), not to a reskin of an existing real-world or fictional firearm.

---

## Open items for the user (not resolved by this document)

1. **Name/class conflict** (flagged at the top): is this weapon replacing Aeolus Rifle as the signature rifle, is it a rename of Vortex Carbine, or is it a genuinely third, new weapon? This affects whether `shared/windWeapons.ts` should be updated.
2. **Three proposed new `WeaponModuleKind` values** (§6: `dampener`, `foregrip`/`verticalGrip`, `overchargeCoil`) need an engineering decision before a 3D artist can build attachments for them.
3. **Two proposed Art Bible material additions** (§3: Ceramic, Carbon Fiber) — should be added to [../art-bible.md](../art-bible.md) §5 formally rather than left as a one-weapon exception, if approved.
4. **Operator assignment** — this backlog doesn't specify which operator (Kai/Lira/Zephyr/Orion, per the new roster, or Kael/Veyra, per existing canon) carries this weapon as their signature. §20's lore is written to be assignable to whichever operator the user confirms.
