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
