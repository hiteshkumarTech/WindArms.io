# WindArms — Decisions

Every major decision goes here, in the order they were made. Future agents should check this before reintroducing a discarded idea. Entries below are drawn from real project history (git/docs) — nothing is hypothetical. See [ai-rules.md](ai-rules.md) for when to add an entry.

---

**2026-07-12 (approx., inferred from README wording) — v1 frozen, v2 declared a ground-up rebuild**

Decision: v2 is a ground-up visual/architecture rebuild, not incremental changes layered onto v1.

Reason: the visual/architecture ambitions for v2 (see [design/art-direction.md](design/art-direction.md), [design/lore.md](design/lore.md)) are a large enough departure that incremental changes on v1's existing rendering/art approach weren't considered viable.

Rejected: incrementally evolving v1's Cyber-City/neon visual identity toward the v2 art direction.

Chosen: v1 stays frozen and playable at windarms.com; v2 starts as a separate effort.

---

**(v1, Phase 9 era) — Lag compensation shipped behind a flag, not enabled by default**

Decision: lag compensation (`LAG_COMP`) is implemented and unit-tested but ships off by default.

Reason: needs real-player soak testing before trusting it in production — the risk (documented in [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md) §9) is "I was behind the wall!" complaints from peeker's-advantage growing with rewind distance.

Rejected: enabling it immediately alongside the rest of Phase 9.

Chosen: ship dark, flip on per-room for A/B testing later (tracked in [roadmap.md](roadmap.md)).

---

**(v1, Phase 7 era) — Accounts are optional, not required**

Decision: the server boots in guest-only mode without `DATABASE_URL` rather than requiring a database.

Reason: keeps the game playable with zero setup; a database hiccup should never be able to take a room down.

Rejected: requiring accounts/database as a hard dependency for any gameplay.

Chosen: guest mode by default, accounts as an opt-in enhancement (see [technical/deployment.md](technical/deployment.md)).

---

**(v1, Phase 7 era) — Friends, parties, and achievements deferred rather than shipped half-done**

Decision: explicitly deferred to the backlog instead of building a partial version.

Reason: these need presence infrastructure that deserves its own phase, rather than being bolted onto the progression system.

Rejected: a minimal/partial friends-list or achievement system alongside Phase 7.

Chosen: full deferral, tracked in [roadmap.md](roadmap.md).

---

**2026-07-12 — Documentation restructured from a single component-level file into `CLAUDE.md` + `docs/`**

Decision: moved the world lore / art direction / operator design brief out of `src/components/game/hud/CLAUDE.md` (where it had been pasted directly into a component folder) into a root `CLAUDE.md` plus a topic-organized `docs/` tree (`gameplay/`, `technical/`, `design/`, `versions/`), and added `ai-rules.md`, `project-overview.md`, `decisions.md`, `todo.md`, `known-bugs.md`, `history.md`.

Reason: the content wasn't HUD-specific, was undiscoverable buried in a component folder, and the project is intended to scale to 30–40 docs over the next few years — a flat single file doesn't scale.

Rejected: keeping everything in one large `CLAUDE.md`, or a flat `docs/*.md` list without subfolders.

Chosen: layered structure (`CLAUDE.md` → agent rules → project docs → code), matching how large software projects organize documentation.

---

**2026-07-12 — v2 declared the current development target; v1 kept as the live, stable build**

Decision: default every new request to v2 unless explicitly scoped to v1; v1 stays live at windarms.com and is not deprecated, just not where new work happens.

Reason: avoids two failure modes — accidentally building v2-scoped work against the old v1 architecture, and treating the still-live, revenue/traffic-bearing v1 build as dead code to be ignored or broken.

Rejected: calling v1 "archived" (implies it's no longer maintained or live, which isn't true).

Chosen: "current stable build" (v1) vs. "current development target" (v2) as the framing, stated in the root [CLAUDE.md](../CLAUDE.md).

---

**2026-07-12 — `agent-rules.md` renamed to `ai-rules.md`**

Decision: the AI-behavior-rules file is named `ai-rules.md`, not `agent-rules.md`.

Reason: "agent" is already an overloaded term in a game codebase — it can mean game AI/NPC agents, network agents, or autonomous player bots, in addition to a coding assistant. "AI Rules" is unambiguous and every coding assistant recognizes it immediately, while staying just as tool-agnostic as "Agent Rules" was intended to be.

Rejected: `agent-rules.md` (the initial choice, made specifically to sound generic/tool-agnostic — see the docs-restructure entry above) and `assistant-rules.md` (also considered, `ai-rules.md` was shorter and equally clear).

Chosen: `ai-rules.md`. If a genuine in-game "agent" concept (NPC AI, bots) is added later, keep it clearly out of this filename's namespace to avoid the same ambiguity recurring.

---

**2026-07-14 — Discovered an already-built V2 preview site; declared code canon over the original text brief**

Decision: while building the "WindArms Studio" documentation expansion, discovered that `src/lib/v2/content/*.ts` and `src/components/landing/v2/*` implement a full, live V2 marketing/preview landing page — currently served at the site root (`src/app/page.tsx` → `LandingV2View`) — with named operators (Kael Aurin, Veyra Solace), a named world (the Skyfront, with POIs: Wind Temple, Storm Reactor, Sky Bridges, Airship Docks), and a named wind-weapon arsenal (Aeolus Rifle, Vortex Carbine, Tempest Cannon, Gust Blade). None of this was reflected in the docs written on 2026-07-12, which were based solely on the original text brief pasted into `src/components/game/hud/CLAUDE.md` (generic "Operator 01–04" archetypes, no named world locations, no named weapons).

Asked the user how to reconcile rather than guessing (this was a factual discovery with real consequences, not a style choice). Answer: **code is canon.**

Reason: code that's actually shipped and live is more authoritative than an earlier text brief, especially once they diverge — an AI or dev implementing v2 gameplay should build toward what's already public-facing, not toward superseded ideation.

Rejected: keeping the two "concept boards" permanently separate and undocumented against each other (would let an agent build v2 abilities around "Momentum Engineer" et al. while the live site promotes Kael Aurin and Veyra Solace, producing two incompatible v2s).

Chosen: [operators.md](gameplay/operators.md) rewritten around Kael Aurin/Veyra Solace as canonical, with the original four-archetype brief preserved below a clear "historical/superseded" divider (not deleted — see [ai-rules.md](ai-rules.md)'s "never delete documentation" rule) since it may still be useful raw material for fleshing out ability kits. New docs added: [design/skyfront.md](design/skyfront.md) (the named world), a "V2 Arsenal" section in [gameplay/weapons.md](gameplay/weapons.md#v2-arsenal-windweaponsts) (the named weapons), and a real STORM-token palette section in [design/art-direction.md](design/art-direction.md#storm-design-tokens-implementation-accurate) (the original abstract palette also preserved, not replaced).

---

**2026-07-14 — Corrected "v1 is live at windarms.com" to account for the V2 preview now occupying the site root**

Decision: docs written 2026-07-12 stated v1 was "live and playable at windarms.com," implying the whole site (landing + game) was v1. That's no longer accurate: the site root now renders the V2 preview landing page, while the actual playable game remains v1 at `/play`.

Reason: found while investigating the V2 preview discovery above — `src/app/page.tsx`'s own comment confirms the V1 landing page was deliberately left in place only "for reference and rollback," not as what's served.

Rejected: leaving the "v1 is live at windarms.com" framing as-is (technically half-true and likely to mislead an agent into thinking the whole live site, including its front door, is v1).

Chosen: precise framing — "v1 is the playable game at `/play`, feature-complete and stable; the site root now serves the V2 preview." Updated in root [CLAUDE.md](../CLAUDE.md), [versions/v1.md](versions/v1.md), and [project-overview.md](project-overview.md).

---

**2026-07-14 — Documentation structure frozen; `design/art-bible.md` created as the canonical visual/audio/UI/animation reference; `image.png` flagged as a mismatched file**

Decision: `docs/design/art-bible.md` is now canonical for all visual/audio/UI/animation questions, superseding older prose in `art-direction.md`/`ui.md`/`audio.md`/`vfx.md`/`animations.md` where they conflict (those files aren't deleted — they still hold v1 implementation facts the bible doesn't repeat). Built from `docs/images/image-1.png` (the real concept board — verified to match essentially every existing doc word-for-word) plus existing code/docs. No new folders were created, per the user's explicit freeze on restructuring.

Also: `docs/images/image.png` — a second image in the same folder — does not match the concept board or any existing doc (gritty military-realism aesthetic, different logo, a tech stack citing PhysX/Redis/WebRTC found nowhere else in this project). Flagged in the Art Bible §28 as a "what not to do" reference rather than deleted or silently treated as equally canonical.

**Update, 2026-07-14 (later same day):** the open question above resolved itself — `image.png` was removed from disk outside this session (not by any action here). Treated as intentional cleanup of the flagged file rather than reverted, since removal was always one of the two outcomes this entry left open. The Art Bible's §28 negative-example writeup was kept (updated to past tense) since the reasoning is still useful even without the file.

---

**2026-07-14 — "War Above The Storm" (STORM tokens, `image-1.png`) confirmed canonical over a third, newer concept image**

Decision: a new file, `docs/images/ChatGPT Image Jul 13, 2026, 11_04_24 PM.png`, appeared in the repo alongside a large commit (`1f72260`) that also (a) physically deleted `image.png`/`image-1.png` from the working tree without committing the deletion, and (b) added a previously-unseen doc, `docs/design/v2-landing.md`. The new image is a different visual direction — different palette (adds purple/pink, absent from `STORM` tokens), "Stylized Realism" instead of "Monumental/Elegant/Clean," different operator art style, different HUD, different logo tagline ("RISE ABOVE. FIGHT BEYOND." vs. "THE WAR ABOVE THE STORM") — though it does match the names in the user's 2026-07-14 production-backlog checklist closely.

Reason for asking rather than guessing: `v2-landing.md` independently confirmed `tokens.ts` (the `STORM` palette) as the *"single source"* for the real, shipped V2 landing implementation — real code (`three/storm/*`, `landing/v2/*`) is already built on the `image-1.png` direction, not the new image's direction. Reconciling toward the new image would be a significant pivot, not a documentation update.

Rejected: silently treating the new image as equally or more canonical (would contradict a large amount of already-shipped code and everything built earlier today, including the Art Bible).

Chosen: **"War Above The Storm" / `STORM` tokens remain canonical.** The new ChatGPT image is a naming/composition reference for the production backlog (`todo.md`) only, not a style reference — future weapon/operator/map blueprints pull names from the backlog but visual style from [design/art-bible.md](design/art-bible.md) and `image-1.png`, not from the new image's rendered art. `image.png` and `image-1.png` were restored from git history (`git checkout HEAD --`) since their deletion looked accidental and this decision confirms they're still the canonical reference.

---

**2026-07-16 — `vortex` (v2) renamed "Vortex Carbine" → "Vortex Rifle"; declared the flagship weapon; production weapon component built**

Decision: `shared/windWeapons.ts`'s `vortex` entry is now "Vortex Rifle" (`weaponClass: 'rifle'`, was `'carbine'`), matching the real production blueprint ([design/weapons/vortex-rifle.md](design/weapons/vortex-rifle.md)) and the real integrated GLB (`public/v2-art/vortex-rifle.glb`). Per explicit user direction, it's the project's first real playable AAA asset and the flagship weapon.

Reason: the name/class had drifted from the blueprint and asset that actually got built; "Rifle" matches both. This does not resolve the older, broader `todo.md` item about v1's "Vortex SMG" vs. v2's "Vortex ___" — that overlap still exists (different id namespaces, `smg` vs `vortex`, so no runtime collision, but the same marketing name is still reused across two different weapons) — see the updated `todo.md` entry.

Also built alongside this rename: a reusable `WeaponShowpiece` component (`src/components/three/weapons/WeaponShowpiece.tsx`) that owns model loading, rim light, glow, and presentation rotation for any weapon, driven by a new per-weapon visual-config registry (`src/lib/v2/weapons/visualConfigs.ts`) — deliberately separate from `windWeapons.ts` (gameplay data) and `pipeline/manifest.ts` (asset validation), so the next weapon is a data entry, not a new component. `AeolusShowpiece.tsx` (the hero-scene showpiece) was refactored to consume it, keeping only the scroll-driven exit drift and the `ProceduralAeolus` fallback, which is unchanged.

Rejected: leaving the rim-light/glow/rotation logic duplicated inline in `AeolusShowpiece.tsx` where a second weapon showpiece would have had to copy it again.

Chosen: extract-before-duplicate, with the extraction scoped to exactly what a second weapon showpiece would actually need (confirmed by rereading `AeolusShowpiece.tsx` in full before writing the replacement, not by guessing what to keep).

---

**2026-07-16 — Phase 4: first playable weapon shipped at `/v2/range`; discovered the real Vortex Rifle GLB has never actually rendered anywhere in V2**

Decision: built a new, isolated route (`/v2/range`) where the Vortex Rifle is a genuinely playable weapon — real fire timing (RPM gate + a literal "turbine spin-up" ramp, not just the flavor text), reload, ADS, procedural first-person animation, camera recoil, pooled tracer/impact/casing VFX, synthesized+pipeline-routed audio, and real raycast damage against hittable/destructible/respawning targets. Populated `shared/windWeapons.ts`'s `vortex.gameplayStats` (damage/rpm/spread/range/falloff/recoil) — first-pass numbers derived from the existing 0..1 `stats` ratios calibrated against v1's real `smg`/`ar` balance (`shared/weapons.ts`), not invented from nothing. Built by mirroring v1's proven FPS architecture (`PlayerController`/`WeaponSystem`/`WeaponViewmodel`/`effectsBus`/`AudioEngine`) into new, separate v2-scoped modules — importing v1's genuinely pure/reusable pieces directly (`lib/game/movement.ts`'s `accelerate`/`applyFriction`/`wishDirection`, `PLAYER` constants, `usePointerLock`) rather than duplicating them, and copying only the parts that are consumer-specific orchestration (Rapier wiring, viewmodel math) or would otherwise require modifying a v1 file to generalize (`AudioEngine`'s `SHOT_RECIPES` is typed against v1's closed weapon union).

Also discovered, by insisting on visual/interactive verification rather than trusting the code: (1) the real GLB (`public/v2-art/vortex-rifle.glb`) resolves and downloads successfully but `useGLTF`'s parse never completes (`PipelineModel`'s `onReady` never fires, in dev or a production build) — meaning **it has never actually rendered anywhere**, including the landing-page hero showpiece, which turns out to have been silently showing `ProceduralAeolus` all along, not the real asset. Likely a Draco-decode failure specific to this sandboxed environment (the decoder script/wasm both download fine, which doesn't prove decoding succeeds) — not root-caused, since that's a pipeline/infrastructure bug well outside this task's scope. (2) The first-person viewmodel geometry, positioned ~0.6m in front of the camera, was fully raycastable and blocked every shot's hit-test at point-blank range regardless of aim — v1's `WeaponViewmodel` avoids this by design; this build initially didn't. Fixed by disabling raycasting on the viewmodel's mesh/sprite subtree (`child.raycast = () => null`), confirmed by then landing an aimed shot and destroying a target.

Reason for documenting rather than quietly fixing and moving on: both are real, currently-shipping-adjacent bugs an agent could easily reintroduce or misdiagnose later (e.g. "why doesn't the real rifle render," "why do shots never seem to hit anything") without this trail.

Rejected: (a) root-causing the Draco/GLTFLoader failure now (a pipeline-infrastructure investigation, not a gameplay one — flagged in `todo.md` instead); (b) leaving the viewmodel visually oversized/self-blocking because the code "looked right" on inspection — both were only caught by actually running Playwright against the live scene and checking real HUD counters (shots/hits/destroyed), not by reasoning about the code.

Chosen: ship the vertical slice against the (already-established, already-used-by-the-showpiece) `ProceduralAeolus` fallback, correctly re-framed for first-person distance via a locally-scoped wrapper (`FALLBACK_SCALE` in `VortexViewmodel.tsx` — doesn't touch `ProceduralAeolus` itself or the showpiece's usage); keep `PipelineModel`'s real-GLB path fully wired so it starts working automatically the moment the underlying pipeline bug is fixed, with no changes needed here.

---

**2026-07-16 — Phase 4.1: the "real GLB never loads" conclusion above was wrong — it loads fine; the mesh itself is the actual problem**

Decision: this corrects the entry immediately above, in the same session. Under explicit instruction not to trust screenshots/silhouette guesses/successful downloads/build output as proof, re-investigated with a manual `THREE.LoadingManager`+`GLTFLoader`+`DRACOLoader` bypass (bypassing drei/Suspense entirely) instrumented at every stage (fetch start/status/bytes, manager progress, parse start/complete/error). Result: **the real GLB loads and parses successfully, every time, with the exact production Draco config.** It just takes longer than the ~2-3s this session originally waited before concluding failure: ~4.5s via the manual bypass, ~2.3s for the real `PipelineModel` component in total isolation (actually faster — no bug there either), and up to ~10s in `/v2/range`'s live scene / ~12s on the landing page, both because a genuinely CPU/GPU-heavy load (1.99M triangles, 111x this project's weapon budget) competes for the main thread with an actively-rendering physics/render loop. Confirmed independently: Draco decoding runs in a Web Worker (not main-thread-blocking, checked in `three-stdlib`'s source); disabling Draco entirely produces an immediate, clean, spec-compliant error (`"No DRACOLoader instance provided"`) rather than a hang, proving the loader isn't doing anything silently wrong — Draco really is required (`extensionsRequired`, not just `extensionsUsed`) and really does work when configured, which it already was.

**Bigger finding, made possible only by finally getting the real asset to render in isolation and looking at it deliberately (flat magenta override, then a second pass with actual shading so 3D form/depth would be legible, camera pulled back far enough to see the whole thing):** the mesh is not one assembled rifle. It's a grid of roughly 10 separate weapon-part-shaped copies — consistent with an intermediate UV-bake/layout sheet (the kind of thing a decimation or texture-baking step produces mid-pipeline) that got exported as the final `public/v2-art/vortex-rifle.glb` by mistake, rather than the single combined/positioned prop it needs to be. This is why the asset has never looked right in *any* context, including the handful of earlier "it's rendering" moments in this session's history — a screenshot of it from far enough away, or blended into a busy scene, isn't enough to catch a multi-part layout by silhouette alone, which is exactly the trap the corrected instruction called out.

Reason for two corrections in one file, same day: the first (Phase 4) conclusion was reached from ~2-3s of patience and a screenshot comparison — a real methodology error, not a fabrication, but wrong. The second, deeper finding (Phase 4.1) was only reachable by rendering the asset ALONE, at a proper distance, with real shading — something no prior pass in this project's history had actually done.

Rejected: (a) declaring the runtime pipeline "fixed" and moving the real (multi-part) GLB into production in either consumer — it loads, but displaying it would be a visible regression versus the current `ProceduralAeolus` fallback, which is a coherent, correct-looking rifle; (b) attempting to isolate/reassemble the "correct" sub-mesh from the grid programmatically — that's asset authoring/replacing the model, explicitly out of scope; (c) leaving the earlier wrong conclusion in place uncorrected.

Chosen: keep `ProceduralAeolus` as what actually renders in both consumers — correct, not a workaround. Added permanent (not temporary-debug) dev-mode observability to `src/lib/v2/pipeline/useAssetPipeline.ts`: resolving/found/loaded-with-timing console logs, so "still loading a real, large asset" is never silently indistinguishable from "nothing exists for this slot" again — that ambiguity is what let the Phase 4 conclusion happen. Documented the multi-part-mesh finding directly in `manifest.ts`'s `vortex-rifle` entry so it isn't lost. Real next step, now correctly scoped: the source asset needs to be **re-exported as a single assembled mesh** by whoever owns the Forge/asset pipeline — decimating the current file would decimate the same 10-part grid, not produce a usable weapon. Logged as the new top `todo.md` HIGH item, replacing the old (inaccurate) "GLB never renders" one.

One more real consequence, caught by thinking through what actually happens in production rather than stopping at "root cause found": `PipelineModel` swaps fallback → real asset automatically once loading finishes — correct, existing behavior, not touched — and the broken file *was* still sitting in `public/v2-art/vortex-rifle.glb`, successfully loading given enough time. Left in place, that meant any real visitor patient enough (~10-12s dwell — unremarkable on a hero landing page) would eventually watch the correct-looking fallback silently get replaced by a grid of disconnected gun parts. Nobody had seen this yet only because nobody had waited that long. Moved the file to `WindArms Assets/Weapons/VortexRifle/vortex-rifle_preview-v0.1_BROKEN-multipart-needs-reexport.glb` (archived next to the original source, not deleted) so `resolveAsset` finds nothing and this slot resolves to the fallback permanently, the same well-tested code path every not-yet-built slot already uses — not a special case. Restoring it to `public/v2-art/vortex-rifle.glb` is the only step needed once a real single-mesh re-export exists.

---

**2026-07-17 — Builder/inspector world-size disagreement resolved: the v0.2 runtime GLB is correct; `inspect-glb.mjs` had a transform-accumulation bug and was fixed**

Decision: when `make-vortex-runtime.mjs` reported the new runtime derivative as 1.000 × 0.270 × 0.139 m (X-long) but `inspect-glb.mjs` reported 0.139 × 0.270 × 1.000 m (Z-long), the GLB was declared correct and the *inspector* was fixed — the asset was not rotated again.

Reason: root-caused, not guessed. The builder bakes the +90° Y orientation via gltf-transform's `Node.setMatrix`, which persists it as decomposed TRS fields (a `rotation` quaternion + uniform `scale` 0.5249 on the root node). The old inspector read only a single root `scale[0]`/`matrix[0]` value, multiplied the raw local vertex bounds by it, and ignored rotation entirely — so it reported the pre-rotation axis frame. The builder's `getBounds` accumulates full node transforms (authoritative), and the in-engine render proof (`VortexRifle_LOD0` visible, correctly oriented in the hero scene) agreed. Blindly re-rotating the asset to satisfy a buggy measuring tool would have actually broken it.

Rejected: (a) rotating/re-exporting the runtime GLB again; (b) shipping vertex-baked rotation in the builder just so naive tools read it (valid glTF carries node transforms; tools must honor them).

Chosen: `inspect-glb.mjs` now composes every node's local matrix (`matrix` field, or T·R·S per the glTF spec), accumulates world matrices from the scene roots, transforms all eight bbox corners per mesh instance, and reports true world size + long axis + world center. Verified against the v0.2 source (expects Z-long ✓) and the derivative (expects X-long ✓ — same numbers as the builder).

---

**2026-07-17 — Milestone 6: first playable slice is a self-contained single-player match (`/v2/play`, "Skyfront Trial"), not multiplayer**

Decision: the first genuinely playable WindArms V2 experience is an offline single-player wave-clear against procedural drones, on its own route, reusing the existing weapon/movement systems — explicitly NOT the start of multiplayer/netcode/accounts.

Reason: it turns the isolated weapon range and asset showcases into an actual game loop (start → fight → die/respawn → win → replay) with the lowest risk and zero new heavy dependencies, giving future assets (operators, maps, weapons) a game to enter instead of another showcase. Multiplayer is a large separate effort with its own milestone.

Key sub-decisions: (a) one authoritative `MatchPhase` state machine with a legal-transition table, never scattered `isPlaying/isDead/isPaused` booleans; (b) the weapon stays a single source of truth — `VortexFireSystem`/`vortexWeaponStore` are reused, moved to `three/weapons/`, and gated by an optional `combatGateRef` rather than forked; (c) `TargetUserData` extracted to `lib/v2/combat/` so range targets and drones share one damage contract and one fire system; (d) the arena is a procedural blockout and the drone a temporary training target — neither is canon (the name "Skyfront Trial" is temporary too); (e) pointer-lock is the single pause pivot (losing it during a live phase pauses; regaining it resumes/starts).

Rejected: (a) building this on `/v2/range` (it stays a weapon-dev environment, per its own scope); (b) starting multiplayer/backend now; (c) a second weapon-state implementation for gameplay; (d) touch controls (deferred — mobile shows a desktop-recommended notice).

Chosen: a modular, independently-replaceable slice documented in [gameplay/skyfront-trial.md](gameplay/skyfront-trial.md); landing Play now points at `/v2/play` while V1 `/play` and `/v2/range` are untouched.

---

**2026-07-17 — Hero showpiece uses a documented DISPLAY scale (2.9), split from the weapon's physical scale (0.68)**

Decision: `visualConfigs.ts`'s `vortex.scale` changed 0.68 → 2.9 for the landing hero stage. Physical scale (0.68 m — blueprint §5) remains the canonical number for physical contexts; the first-person viewmodel keeps its own independent scale.

Reason: the hero composition (group anchor x≈5, camera path, screenshot-approved 2026-07-16) was designed around the `ProceduralAeolus` fallback, whose real measured span is ~3.43 m (4.4 local units × 0.78 internal scale) — a deliberately monumental hero prop. The real v0.2 GLB's long axis is exactly 1.000 m, so at physical scale 0.68 it rendered ~5× smaller than the stage was composed for: tiny, adrift at the right-side anchor. 2.9 restores ≈85% of the approved footprint (2.9 m span). Rim-light/glow offsets were rescaled by the same ×4.26 factor rather than re-eyeballed.

Rejected: (a) resizing the GLB itself for framing (asset modification for a presentation problem); (b) moving the shared group anchor (also repositions the fallback shown during load, and its narrow-viewport pull-in logic is screenshot-tuned); (c) leaving 0.68 and calling the composition acceptable.

Chosen: display scale as a per-context presentation value with the derivation documented inline in `visualConfigs.ts`. Precedent: display/physical scale splits are standard hero-shot practice; the config layer is exactly where per-context presentation belongs (`WeaponVisualConfig`'s stated purpose: "how does it present," not "what is it").

---

**2026-07-17 — LOD routing made context-specific; `vortex-rifle`'s stale 18k-triangle validation budget replaced with a per-LOD budget**

Decision: `/v2/range`'s `VortexViewmodel` now explicitly requests LOD1 (`public/v2-art/vortex-rifle.lod1.glb`, 55,834 tris) instead of silently inheriting whatever the global render-quality store picked (LOD0, 139,598 tris, at the default `'high'` quality — the same tier the landing hero legitimately wants). Added `requestedLod` end to end: `PipelineModel` prop → `useResolveModelSlot`'s new `ResolveModelSlotOptions` → `resolveModel`'s existing (already-supported, just never wired to a per-consumer override) `preferredLod` parameter. Also replaced `manifest.ts`'s `vortex-rifle.budget.maxTriangles: 18000` (the `__template` placeholder, never revisited once real LOD numbers existed) with a real default (150,000, LOD0/showpiece) plus a new `budgetByLod` override (60,000 at LOD1/viewmodel) — `validateAsset` now takes the actually-resolved `lod` and checks the matching tier. Emptied `vortex-rifle`'s `requiredSockets`/`requiredClips` (nothing currently reads either) and moved the v1.0 target list to new informational-only `plannedSockets`/`plannedClips` fields that are never validated.

Reason: both were real, user-visible defects, not cosmetic. The LOD mismatch meant `/v2/range` was downloading and decoding 2.5× the triangle count it needed (139,598 vs 55,834), directly costing the load-time budget `useAssetPipeline.ts`'s Phase 4.1 logging exists to make visible — a first-person context has no business paying showpiece-tier cost. The budget was a straightforward stale-default bug: `18000` was copied from `__template` before the real asset existed and nobody went back to raise it once `tools/inspect-glb.mjs` established real showpiece (150k) / viewmodel (60k) gates — so every single load logged a false `console.error`, which is exactly the kind of noise that makes a real future regression easy to miss in the middle of it. The socket/clip warnings were the same shape of problem: listing a target nothing currently consumes just produces a warning nobody can act on, indistinguishable from an actual regression.

Rejected: (a) a second manifest entry or a second slot for the FP tier (the asset is the same weapon at a different tier, not a different asset — `budgetByLod` models that directly); (b) hardcoding the `.lod1.glb` URL inside `VortexViewmodel.tsx` (bypasses the resolver's existence-probing/fallback entirely, and breaks the moment the filename convention changes); (c) silencing the triangle-budget check globally instead of fixing the number (would hide a real future regression, e.g. someone accidentally shipping a 2M-triangle file again); (d) leaving `requiredSockets`/`requiredClips` populated and just suppressing their log output (the manifest entry itself would keep claiming something false).

Chosen: a typed, optional, per-call-site LOD override on the existing resolver (smallest mechanism already compatible with the pipeline, per the brief) + a per-LOD budget map on the existing manifest entry (same shape as `budget`, additive, keeps every other slot's validation behavior unchanged) + a `planned*`/`required*` split that gives "this is a real gap, not required yet" its own honest representation instead of overloading `required*` to mean both. Verified live: landing still resolves LOD0 (`real asset found at lod0`), range now resolves LOD1 (`real asset found at lod1`, loads in ~4.3s — faster than LOD0's own load time, a real side benefit of fetching less data), no triangle-budget or socket/clip console output on either page, gameplay (hip-fire, ADS, hit detection) unaffected.

---

**2026-07-17 — LOD mismatch detection is a separate check from budget validation, not a side effect of it**

Decision: this corrects a claim in the entry immediately above (and in `docs/forge/vortex-rifle-v0.2.md`), same day. That entry said an accidental LOD0 load in `/v2/range` "would fail the 60k ceiling instead of silently passing" — checked against the actual code, this is false. `validateAsset` receives only the *resolved* `lod` and checks it against `budgetByLod?.[lod] ?? budget`; a resolved-LOD0 load would look up `budgetByLod[0]` (no entry), fall back to the 150,000-triangle default, and 139,598 passes that comfortably. The budget check has no way to know a different tier was originally requested — it only ever validates "does what loaded fit what loaded's own tier allows," which is correct on its own terms but is not the same claim as "detects a misrouted tier."

Reason: caught by re-deriving the actual code path rather than trusting the prior summary — `entry.budgetByLod?.[lod]` is keyed by the resolved tier by construction, so it can never fail *because* a different tier was requested; only `requestedLod` vs. `resolved.lod` — two values that were never compared anywhere — could catch that.

Rejected: (a) leaving the incorrect claim in place; (b) threading `requestedLod` through `useLoadedPipelineAsset`/`validateAsset` to fold this into `ValidationResult` (real plumbing through three more layers for what is fundamentally a resolution-stage fact, not a loaded-asset-content fact — `validateAsset` checks the GLB's own triangles/materials/sockets, not "did we get the URL we meant to ask for"); (c) silently dropping the mismatch case rather than surfacing it, since a requested-tier-missing failure mode should be loud in dev, not discovered by someone eyeballing triangle counts later.

Chosen: a standalone check inside `useResolveModelSlot`'s own resolve callback, where `requestedLod` (the parameter) and `resolved.lod` (the actual result) already coexist without new plumbing: if a call site passed `requestedLod` and the resolved tier differs, log `console.warn` naming both. Gated on `requestedLod !== undefined`, so the normal quality-driven path (the landing showpiece, which passes no `requestedLod`) can never trigger it — only a call site that asked for something specific and didn't get it. Doesn't touch `resolveModel`'s fallback behavior (still finds and renders a working tier; the warning is additive, not blocking) and doesn't touch the budget check (still correctly validates whatever tier actually loaded against that tier's own ceiling — both mechanisms are correct, they just answer different questions).

---

**2026-07-18 — Vortex Rifle FP pose correction: ground-truth-verified rotation fix, not a guess**

Decision: the first-person viewmodel's tilted/sideways read was a real rotation bug, not a framing preference — the GLB's local +X (muzzle-forward) axis was never rotated into camera-forward; the old `REST`/`ADS_REST` constants only translated the model into view space and applied small hand-tuned tilts on top of an uncorrected base orientation. Fixed by isolating the variable: a clean zero-rotation screenshot test first (revealing the true baseline — at identity, local +X = view +X exactly, pure side profile), then hand-deriving and verifying `rotateY(+π/2)` maps local +X → view -Z, THEN layering the small natural hip/ADS tilts back on top of the now-confirmed-correct base. Replaced the old scattered `REST`/`ADS_REST`/`VIEWMODEL_SCALE` component constants with a typed `VORTEX_VIEWMODEL_POSES` config (`vortexViewmodelPose.ts`) — one `{position, rotation, scale}` per pose (hip/ADS), shared unchanged by `/v2/range` and `/v2/play` since both mount the same `VortexViewmodel`.

Reason: the first attempt (guessing a rotation sign while simultaneously changing position AND multiple rotation components at once) produced an ambiguous result — a confusing diagonal silhouette that could have meant "wrong sign," "wrong axis," or "the tilt offsets are fighting the correction," with no way to isolate which. Testing one variable at a time against a real running scene (not derived-and-assumed) is what actually resolved it, and is the approach used for the rest of this pass's empirical work (the muzzle-anchor coordinates below).

Rejected: (a) guessing a rotation value and eyeballing "close enough" without a zero-rotation control test; (b) leaving base pose/rotation numbers scattered as inline component constants (the brief's explicit "single typed config" requirement, and the same anti-pattern already fixed elsewhere in this codebase for weapon/match tuning); (c) baking the correction into the GLB itself (out of scope — "do not rebuild either rifle GLB," and the fix is a presentation-layer transform, not a modeling error).

Chosen: `vortexViewmodelPose.ts`'s `MODEL_FORWARD_CORRECTION_Y = Math.PI / 2` applied as the base of both poses' `rotation[1]`, with the derivation and the screenshot-verification method documented inline in the file. Visually confirmed: hip-fire reads as a natural, correctly-foreshortened rifle in the lower-right with the barrel pointing toward the crosshair; ADS reads centered with the barrel aligned straight down the reticle, no scale jump, no clipping. Honest limitation recorded in the same file and in [gameplay/skyfront-trial.md](gameplay/skyfront-trial.md): this is a corrected *floating* viewmodel, not a *held* one — no operator-arms model exists yet, so there's no real hand/grip contact; true holding needs a future arms rig + hand IK.

---

**2026-07-18 — Muzzle/tracer origin: a temporary hand-measured runtime anchor, explicitly not an authored GLB socket**

Decision: the visible tracer/muzzle-flash previously spawned from a fixed camera-relative offset (`VortexFireSystem`'s old `MUZZLE` constant) with no tie to the weapon's actual geometry, so it visibly started near the receiver/weapon-center rather than the barrel — independent of, and additional to, the tilt bug above (fixing the tilt alone would not have fixed this). The real GLB has no authored `socket_muzzle` (Blender export is still v0.2, per `docs/forge/vortex-rifle-v0.2.md`), so rather than rename an arbitrary existing node to pretend one exists, a new `vortexRuntimeAnchors.ts` defines `VORTEX_RUNTIME_ANCHORS.muzzleLocal` — a hand-measured local-space coordinate near the barrel's +X bounding extent, Y/Z eyeballed to the visible barrel bore rather than the mesh's bounding-box center. `VortexViewmodel` converts this to world space every frame (`group.updateWorldMatrix(true, false)` then `group.localToWorld`, avoiding the one-frame lag `matrixWorld` would otherwise have from only updating during the render pass) and publishes position + forward direction through a new plain-object singleton, `muzzleWorldPose.ts` (same bridge convention already established for `rangeLocalPose`/`fireSignal`/`reloadSignal`). `VortexFireSystem` reads it for the *visual* tracer/muzzle-flash origin only; the old camera-relative computation is kept as a fallback for the theoretically-unreachable case where the viewmodel hasn't run yet a frame.

Reason: PART 4 of the brief is explicit that gameplay hit detection must stay camera-based (spread/recoil/damage tuning is validated against camera-ray behavior) while the *visual* effect should read as coming from the barrel — conflating the two would either break aim-feel or require re-deriving damage balance for no gameplay reason. A real socket is the correct long-term answer but requires a Blender re-export, explicitly out of this pass's scope ("do not rebuild either rifle GLB," "do not modify the high-poly source").

Rejected: (a) renaming an existing GLB node to `socket_muzzle` (the brief's explicit prohibition — would misrepresent an unauthored coordinate as authored data); (b) computing the muzzle position analytically from the mesh bounding box at runtime (the bbox center is not the bore — verified visually via a temporary debug sphere that a bbox-center-based guess sits behind the visible barrel tip); (c) moving hit detection to the muzzle anchor (would change spread/recoil feel and contradicts the brief's explicit "do not change weapon damage or raycast behavior merely to make the tracer look correct").

Chosen: `vortexRuntimeAnchors.ts`'s `muzzleLocal: [0.47, -0.035, 0]`, verified against the running scene via a temporary `DEBUG_SHOW_MUZZLE_ANCHOR` sphere (removed before completion — see `VortexViewmodel.tsx`) placed at the exact local anchor position; confirmed visually correct in hip-fire, ADS, sprint, reload, inspect and sustained-ADS-fire, and confirmed via a live-fire screenshot that the tracer now visibly originates at the barrel tip rather than the receiver. `casingLocal` is populated per the brief's suggested interface but deliberately NOT wired to reposition shell-casing ejection this pass — casing eject keeps its old camera-relative approximation (out of scope; only muzzle flash/tracer/smoke were required). This anchor is explicitly temporary and must be deleted once a Blender-exported v1.0 asset ships a real `socket_muzzle` — do not describe it as one in any future doc or comment.

---

**2026-07-18 — Skyfront Trial difficulty: three presets, Medium is a byte-identical carryover of the original single-difficulty tuning**

Decision: added `TrialDifficulty` (`'low' | 'medium' | 'max'`) with one source of truth, `src/lib/v2/play/difficulty.ts` — `TRIAL_DIFFICULTIES` (per-preset multipliers + drone count + match time), `resolveDroneConfig()` (base `DRONE` constant × preset multiplier → effective per-drone combat numbers), `resolveDroneSpawns()` (which of the 8 hand-placed spawn positions a preset uses). Medium's multipliers are all `1`, `droneCount` is `TRIAL.DRONES_TOTAL` (8, unchanged), `matchTimeS` is `TRIAL.MATCH_TIME_S` (180, unchanged) — the original tuning was not rebalanced to make room for the other two presets.

Reason: the brief required a difficulty system without touching the already-playtested default experience, and without duplicating base drone statistics (a second copy of HP/damage/timing numbers per preset would drift out of sync with `enemyConfig.ts` the first time either was tuned independently). A multiplier-over-a-single-base-table design makes "Medium is unchanged" a structural guarantee (every multiplier literally is 1) rather than a claim that has to be manually kept true across edits.

Rejected: (a) three independent full stat tables (duplicates `DRONE`, the brief's explicit "do not duplicate base drone statistics" rule, and lets Medium silently drift from the original numbers over time); (b) scaling the Vortex Rifle's own damage *output*/recoil, or the player's max HP/movement speed, by difficulty (the brief's explicit "do not use difficulty to increase the Vortex Rifle's recoil or reduce player damage" — the weapon and the player's own baseline stats are untouched by every preset). This is distinct from `droneDamageMultiplier`, which is *not* rejected — it deliberately scales the damage the player **takes** from drone bolts (an enemy stat, not a player or weapon stat), which is the entire mechanism by which Max applies pressure without touching the rifle or the player's HP pool. (c) scaling the pre-shot windup telegraph (would make Max's attacks less readable/dodgeable, contradicting "every bolt stays visible and dodgeable — nothing is instant or unavoidable"); (d) adding new drone spawn positions for Max (arena-touching, out of this pass's scope — Max reuses all 8 existing hand-placed spawns and differentiates purely through the other multipliers); (e) a raw index-slice of `DRONE_SPAWNS` for Low's reduced count (an arbitrary slice could produce an unbalanced subset depending on array order — Low instead filters to an explicit, documented, balanced 5-id set: the three main-deck drones plus one per flank).

Chosen: Low = 5 drones (`deck-a/b/c`, `left-lo`, `right-lo`), softer/slower/less accurate, +30s; Medium = unchanged 8-drone/180s baseline; Max = same 8 drones, harder/faster/more accurate, −15s. Selection lives on `matchStore.ts` (`selectedDifficulty`, `selectDifficulty()`, locked once countdown begins), with `beginCountdown()` and `restart()` both bumping `restartNonce` so drones re-seed with the locked-in preset's resolved stats right as combat starts — closing a stale-closure gap where switching difficulty during the pre-deploy 'ready' screen would otherwise leave already-mounted drones with whichever config existed at their original mount time. The HUD, `MatchOverlay`, `EndMatchScreen` and drone AI all resolve through the same `TRIAL_DIFFICULTIES`/`resolveDroneConfig`/`resolveDroneSpawns` functions — never a locally recomputed copy — per the brief's explicit requirement that the HUD, drone AI and store can never disagree. Verified via Playwright: Low→Max→Low pre-deploy switching produces no early spawns or console warnings; deploying Low shows the correct 5-drone/3:30 HUD and countdown text; deploying Max shows the correct 8-drone/2:45 HUD; Restart Match from the pause menu preserves the selected difficulty through a full reset (drone count, timer, HP, ammo); navigating away to `/v2/range` and back to `/v2/play` resets the selection to Medium.

---

**2026-07-18 — Skyfront Trial timing cleanup: real elapsed time for gameplay timers, a fixed-step accumulator for movement, kept strictly separate**

Decision: a headless low-FPS Playwright test (used to verify the difficulty/muzzle work above) surfaced a genuine frame-rate-dependent timing bug, not just a testing inconvenience — a 3-second countdown took ~21 real seconds, and a 2:45 Max match timer only drained ~49 simulated seconds over 300 real seconds (a ~6-7x dilation), in an environment logging repeated "GPU stall due to ReadPixels" warnings (a software-rendered/GPU-stalled headless Chromium, real frames arriving far slower than the code's own assumptions). Root cause: `MatchDirector.tsx` clamped `rawDelta` to `Math.min(rawDelta, 1/20)` on EVERY frame before feeding it to `matchStore.tick()`, which drives the countdown/match/respawn timers by direct subtraction (`remaining - deltaS`). That clamp was written to guard against a single huge gap (a backgrounded tab waking up) but applied to every frame indiscriminately — so any real frame slower than 20fps silently lost time forever, compounding across the whole match.

Audited every clamped-delta usage across `MatchDirector`, `matchStore.tick`, `PlayerController`, `DroneSquad`, `DroneEnemy`, `DroneBoltPool`, `WindLift`, and the Vortex weapon timers (`vortexWeaponStore.ts`/`VortexFireSystem.tsx`/`VortexViewmodel.tsx`) before changing anything. Result: `MatchDirector`/`matchStore.tick` was the ONLY real gameplay-timer bug. Every cooldown/duration in `DroneEnemy.tsx` (fire interval, windup, stun, spawn scale-in, destroy shrink, strafe-flip) and every Vortex weapon timer (fire rate/RPM spin-up, reload, inspect, ADS) was ALREADY measured against an absolute `performance.now()` timestamp, never accumulated from a frame delta — so those were never subject to this bug and needed no change. The only genuinely delta-accumulated values elsewhere (`PlayerController`'s movement/physics integration, `DroneEnemy`'s translation/hover phase, `DroneBoltPool`'s projectile translation, `WindLift`'s cosmetic scroll) are all MOVEMENT/visual concerns, which — unlike timers — have a legitimate reason to be delta-based and a legitimate reason to be bounded (numerical/physics stability, no one-frame teleport).

Reason: gameplay timers (countdown, match clock, respawn, and by extension anything that would use real elapsed time — attack cooldowns, telegraphs, stun/destruction durations, UI timers) must track real wall-clock time exactly regardless of frame rate; a low-FPS player earns no gameplay advantage or penalty just from their hardware/rendering path being slow. Movement, by contrast, is legitimately allowed to be clamped or run through a fixed-step model — the brief's own classification — because unbounded per-frame movement risks tunneling/instability, and because (see below) the Source-style friction/accel formulas already in use are not perfectly step-invariant, so changing their integration granularity is itself a balance-affecting change that must be approached far more conservatively than a plain timer fix.

Rejected: (a) removing the clamp entirely with no replacement policy (would let a tab-background wake-up instantly fast-forward or skip the countdown/match/respawn — a real, jarring regression in the other direction); (b) converting `PlayerController`'s movement integration to the same fixed-step accumulator used for drones/projectiles (rejected specifically — `lib/game/movement.ts`'s Source/Quake-style `applyFriction`/`accelerate` are well-known to be non-step-invariant: running the same formula in more, smaller substeps measurably changes the resulting velocity curve, not just its precision. Converting player movement to multi-substep would be a real, if subtle, movement-feel/balance change, which this pass's brief explicitly rules out — "do not redesign gameplay," "do not change balance." Drone/projectile movement carries no such risk: their integration is plain `position += velocity * dt` linear extrapolation, which IS step-invariant — N substeps of size `dt/N` sum to exactly the same displacement as one step of size `dt` — and `DroneEnemy.update()`'s other per-call side effects (destruction, hit-flash, spawn-scale, attack-firing) are all idempotent within a single rendered frame's substeps because they key off the single shared `now` timestamp, not off how many times `update()` was called — verified by re-reading every state transition in `DroneEnemy.tsx` before applying the accumulator there.); (c) a single global "one true delta" passed everywhere (the brief's own "do not pass one ambiguous delta value everywhere" — timers and movement have different correctness requirements and must be visibly different values, hence the `realDeltaS`/`simulationDeltaS` naming split); (d) letting the movement fixed-step accumulator fully catch up at every tested FPS tier including 5fps (would require raising `MAX_SUBSTEPS_PER_FRAME` from 8 to ~12+, i.e. processing up to 200ms of substeps in one rendered frame — defeats the point of a substep cap as a stability/spiral-of-death guard; 8 substeps (~133ms) was chosen to fully cover 10fps with margin while still bounding the worst case, and the resulting 5fps shortfall is measured, bounded, and documented in `matchTiming.test.ts` rather than silently accepted).

Chosen, exact architecture:
- **Real time (`realDeltaS`)** — `MatchDirector` now passes R3F's per-frame `rawDelta` straight through, UNCAPPED, to `matchStore.tick(realDeltaS)`. The store itself caps a single call's contribution at `MAX_TICK_REAL_DELTA_S = 1` (exported from `matchStore.ts`) — normal per-frame real time (even a severe-stutter 5fps frame, 0.2s) is always far below 1s and is NEVER capped, so ordinary play at any frame rate credits real elapsed time exactly; only a genuinely large single gap (tab-background wake-up) is capped, and the capped amount is effectively lost, not queued — a deliberate middle ground between "instantly fast-forward the match on tab-focus regain" (unfair) and "let backgrounding pause the match for free" (exploitable). This single constant is the one place a tab-restoration policy is enforced, at the source of truth, so no caller can forget it.
- **Simulation time (`simulationDeltaS`)** — everything movement/visual keeps a clamped-or-fixed-step delta, never real time. `PlayerController` keeps its existing single `Math.min(rawDelta, 1/30)` clamp, renamed for clarity, functionally unchanged (see Rejected (b) above for why). `DroneSquad` and `DroneBoltPool` now run their per-drone/per-bolt update loops through a shared fixed-step accumulator, new `src/lib/v2/play/fixedStep.ts` (`FIXED_STEP_S = 1/60`, `MAX_SUBSTEPS_PER_FRAME = 8`): at ≥60fps this costs exactly one substep per frame (byte-identical behavior to before), under a slow frame it runs multiple 1/60s substeps in the same rendered frame to keep movement close to real elapsed time instead of running in slow motion, and any backlog beyond 8 substeps (~133ms) is dropped rather than queued — bounded, no spiral of death, no one-frame teleport, regardless of how large a single frame's real delta is. `WindLift`'s purely cosmetic scroll animation keeps a simple clamp (renamed `simulationDeltaS`) — no gameplay stake, a full accumulator would be unjustified complexity there.
- **Test coverage** — new `src/lib/v2/play/matchTiming.test.ts` (wired into `npm test`), deterministic (no real clock, no flakiness): simulates 60/30/10/5fps frame sequences for 10 seconds of wall-clock input and asserts the countdown/match/respawn timers advance by ~10.000s of real time at EVERY tier (the exact regression test for this bug — includes a dedicated case reproducing the original failure mode: a 3s countdown must finish after 3s of real 5fps frames, not ~18-21s); asserts pause freezes every timer at every tier; asserts the `MAX_TICK_REAL_DELTA_S` cap holds for a huge single tick (no instant-defeat, no instant-countdown-skip on tab-focus regain); and separately asserts the movement accumulator preserves full real time at 60/30/10fps, degrades to a bounded (not catastrophic) ~67% at the extreme 5fps tier, never exceeds the substep cap, never leaks a backlog into subsequent frames, and never produces a negative/NaN carry. All 40 tests (13 pre-existing + 27 new) pass.
- **Live-verified**: on `/v2/play`, sampling the match clock twice 5 real seconds apart now reads exactly `3:00` → `2:55` (previously this pass's own headless test measured a ~6-7x dilation before the fix).
