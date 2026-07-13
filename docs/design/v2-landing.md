# V2 Landing Page — Implementation Reference

Companion to [art-direction.md](art-direction.md) (philosophy) — this maps the concept board onto the shipped V2 landing implementation on the `windarms-v2` branch.

## Palette (single source: `src/lib/v2/tokens.ts` ↔ tailwind `storm.*`)

| Role | Token | Hex |
|---|---|---|
| Primary marble | storm.marble | `#EDEAE3` |
| Marble shadow | storm.mist | `#C7CFD6` |
| Steel | storm.steel | `#8E99A4` |
| Slate rock | storm.slate | `#3E4A5A` |
| Page abyss | storm.abyss | `#0A1522` |
| Panel navy | storm.deep | `#12263C` |
| Storm blues | storm.mid / storm.blue | `#1E3A5C` / `#2E6FA3` |
| Sky | storm.sky | `#58B7E6` |
| Energy core | storm.energy | `#4FC3FF` |
| Ancient gold | storm.gold / storm.golddeep | `#E3A23C` / `#B8860B` |
| War crimson | storm.crimson | `#B02E2E` |

Sky dome gradient: zenith `#16283E` → mid `#4E8DBE` → horizon `#D9E7F2`.

## Architecture invariants

- **The page is the registry.** `SECTIONS` in `src/components/landing/v2/sections/index.ts` defines order and composition; sections are swappable one-liners.
- **Content is data.** Every word lives in `src/lib/v2/content/*` (per-section files, localization-ready). Weapon data lives in `shared/windWeapons.ts` — the game adopts the same config later; never fork it.
- **Art is a slot.** `public/v2-art/` + AssetResolver (glb → webp → png → jpg → procedural fallback). Dropping/removing files upgrades/degrades sections with zero code changes. Slots: `hero-key`, `weapon-{aeolus,vortex,tempest,gust}`, `operator-{1,2}`, `aeolus.glb`.
- **Scroll never touches React state.** ScrollTrigger → `scrollState` module ref → canvas frame loop. Camera choreography is the keyframe path in `StormBackdrop.tsx`.
- **Animation lives in hooks** (`v2/hooks/*`), never inline in section markup.
- **Figma reconciliation:** each `SectionShell` carries `figmaNode`; populate per-frame ids when the design file exists and reconcile section-by-section.
- Boot preloader: once per session, click-to-skip, bypassed for reduced motion.

## Scroll story (camera keyframes)

Hero (low in the clouds, showpiece rifle right) → Arsenal (drift right, rifle exits) → Operators (pan left) → Skyfront (pull up toward top-down) → Pillars (sky darkens, lightning quickens) → Deploy (golden dive).
