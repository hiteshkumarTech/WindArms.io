# WindArms — Tech Stack

> Topic-sliced excerpt of the v1 build. Full context in [v1.md](../versions/v1.md); nothing here has been reworded.

## Client

Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS, GSAP, Framer Motion, React Three Fiber + Drei + postprocessing, Rapier physics (`@react-three/rapier`), Zustand, Lucide icons.

## Server

Standalone TypeScript package (`server/`): Express + Socket.IO for the realtime game server, Prisma + PostgreSQL for accounts/progression (optional — see [../gameplay/mechanics.md#accounts--progression](../gameplay/mechanics.md#accounts--progression)), bcrypt for password hashing, JWT for auth tokens. Tested with `node:test` — zero test-framework dependencies (see [networking.md](networking.md)).

## Shared

`shared/` holds protocol, weapon, arena, map and progression definitions imported by both the client (via the `@shared/*` alias) and the server, so the two sides can never disagree about data shape or balance.

## No game engine

No downloads, no external game engine — the entire client-side 3D layer (landing trailer scene, arena, weapons, characters, weather, effects) is built on Three.js/React Three Fiber, and all audio is synthesized at runtime on raw Web Audio (zero shipped audio assets). See [../gameplay/mechanics.md](../gameplay/mechanics.md), [../gameplay/weapons.md](../gameplay/weapons.md) and [architecture.md](architecture.md) for how these are used.
