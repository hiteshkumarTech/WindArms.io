# WindArms — Folder Structure

> Topic-sliced excerpt of the v1 build. Full context in [v1.md](../versions/v1.md); nothing here has been reworded.

## Top level

```
src/        # client app (components, app router, hooks, lib) — detail below
server/     # multiplayer game server (Express + Socket.IO) — see networking.md
shared/     # protocol.ts, weapons.ts, arena.ts, maps.ts, progression.ts — imported by both client and server
docs/       # documentation set — see root CLAUDE.md for the index
```

## `src/`

```
src/
├── app/                      # App Router: layout (metadata, Inter font), page, globals.css, icon.svg
├── components/
│   ├── landing/              # Page composition
│   │   ├── LandingView.tsx   # Single-viewport shell; code-splits the WebGL canvas (ssr: false)
│   │   ├── Navbar.tsx        # Liquid-glass navbar, staggered links, glow underline
│   │   ├── MobileMenu.tsx    # Full-screen glass menu (AnimatePresence)
│   │   ├── Hero.tsx          # GSAP word-stagger blur-fade, pointer parallax, CTAs
│   │   ├── StatusRow.tsx     # Live status chips (players / servers / ping / season)
│   │   ├── StatCards.tsx     # Floating glass stat cards over the 3D rifle
│   │   └── PreviewCards.tsx  # Heroes / Weapons / Maps / Competitive cards
│   ├── three/                # WebGL layer
│   │   ├── CinematicBackground.tsx   # Canvas config (DPR clamp, no-AA + bloom)
│   │   ├── SceneErrorBoundary.tsx    # WebGL failure → static fallback
│   │   ├── BackgroundFallback.tsx    # Ambient gradient (loading + fallback)
│   │   └── scene/
│   │       ├── Scene.tsx             # Fog, lighting rig, composition
│   │       ├── Rifle.tsx             # Procedural assault rifle, emissive accents
│   │       ├── CitySkyline.tsx       # Instanced silhouette + neon windows
│   │       ├── Embers.tsx / Rain.tsx # Buffer-attribute particle systems
│   │       ├── Smoke.tsx             # Canvas-texture billboards
│   │       ├── LightRays.tsx         # Additive shafts + lens flare sprite
│   │       ├── CameraRig.tsx         # Handheld drift + pointer parallax
│   │       └── Effects.tsx           # Bloom / noise / vignette composer
│   └── ui/                   # Reusable primitives
│       ├── GlassButton.tsx   # Magnetic hover, click ripple, 3 variants
│       ├── GlassCard.tsx     # Cursor tilt + glare + hover lift
│       ├── IconButton.tsx, Logo.tsx, DiscordIcon.tsx
├── hooks/                    # useMagnetic, useTilt, usePrefersReducedMotion,
│                             # useSimulatedLiveStats, useIsomorphicLayoutEffect
├── lib/                      # cn(), clamp(), seeded PRNG, content constants
└── types/                    # Shared landing types
```

Game-specific components (HUD, weapons, characters, world) live under `src/components/game/` — each such folder may carry its own `CLAUDE.md` for guidance scoped to that folder only (e.g. [src/components/game/hud/CLAUDE.md](../../src/components/game/hud/CLAUDE.md)).
