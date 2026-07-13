# WindArms — Architecture

> Overview of how the v1 codebase fits together. Full context in [v1.md](../versions/v1.md); nothing here has been reworded. Detail split into dedicated docs — see the links below.

## Detail docs

| Doc | Covers |
|---|---|
| [tech-stack.md](tech-stack.md) | Client, server, and shared dependencies |
| [folder-structure.md](folder-structure.md) | Full `src/` tree and top-level layout |
| [deployment.md](deployment.md) | Vercel/Railway/Render deploy steps, Docker, accounts setup |
| [performance.md](performance.md) | Rendering, netcode payload, and quality-tier performance decisions |
| [coding-standards.md](coding-standards.md) | Project-wide coding rules |
| [networking.md](networking.md) | Multiplayer server, netcode, matchmaking, anti-cheat |
| [../gameplay/mechanics.md](../gameplay/mechanics.md) | Movement, combat, match UI, maps/audio/VFX, progression |
| [../gameplay/weapons.md](../gameplay/weapons.md) | Weapon system, visual/geometry overhaul |

## Design notes that don't fit elsewhere

The landing page holds exactly one viewport (`h-[100dvh]`, `overflow-hidden`) — no scrolling, like a game launcher.

The "trailer" is a real-time Three.js scene rather than a video: procedural rifle, instanced cyber-city skyline, GPU particle fields (embers, rain), smoke billboards, volumetric-style light shafts, HDR bloom, film grain and vignette. It costs no asset downloads and stays crisp at any resolution. It can be swapped for an `<video>` trailer later without touching the page layout.

Accessibility: `prefers-reduced-motion` disables camera shake, particle motion, parallax and entrance animation; the WebGL layer is `aria-hidden` with a static fallback when WebGL is unavailable; all interactive elements have focus rings and labels.

The status row (player count, ping) is a clearly-named simulation (`useSimulatedLiveStats`) — it gets replaced by real Socket.IO telemetry in Phase 3.

## Stability fix: raycaster/audio bug

Two intermittent regressions (firing audio occasionally not playing; weather/particles occasionally stalling — sometimes together) were traced to a shared root cause rather than patched around. Neither of the two gameplay raycasters (`WeaponSystem.tsx`'s fire-time hit test, `TracerPool.tsx`'s remote-shot surface probe) set `raycaster.camera`, which `THREE.Sprite.raycast()` dereferences unconditionally — any raycast against a scene containing a visible sprite (muzzle smoke, an impact spark) threw. That aborted the current shot's `fire()` before it reached `audio.shot()`, and since React Three Fiber's frame loop runs every `useFrame` subscriber in one uncaught pass before a single `gl.render()` call, the throw also skipped that entire frame's render — the shared mechanism behind both symptoms during sustained combat. Both raycasters now set `.camera` before intersecting.

Separately, `AudioEngine.ensure()` (`lib/audio/audioEngine.ts`) fired `ctx.resume()` and synchronously checked `state === 'running'` on the next line — a check that can never pass yet, since resume is asynchronous — silently dropping any sound triggered while the context happened to be suspended (browser power-saving, backgrounding). It now returns the context unconditionally, since WebAudio permits scheduling on a still-suspended context.

The related quality-tier tuning fix from the same stability round is in [performance.md](performance.md).
