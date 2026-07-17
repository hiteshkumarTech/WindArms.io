# WindArms Forge — Training Roadmap

A progressive Blender curriculum for anyone producing assets for WindArms — from first launch to a shippable hero weapon. Each level builds on the last; don't skip ahead on skills, even if the WindArms-specific asset at that level doesn't interest you yet. Pairs with [`blender-shortcuts.md`](blender-shortcuts.md) (the minimum keybinds you need starting at Level 1) and [`quality-checklist.md`](quality-checklist.md) (what "done" means starting at Level 3).

---

## Level 1 — Viewport Navigation

**Goal:** Get comfortable moving around a 3D scene without thinking about it. Every later level assumes this is automatic.

**Expected output:** No file to save. Comfortably orbit, pan, and zoom; switch between perspective/orthographic and the numpad front/side/top views without hunting for menus.

**Skills learned:** Orbit/pan/zoom (mouse + numpad), perspective vs. orthographic, the 3D cursor, view alignment (numpad 1/3/7), frame-selected.

**WindArms asset produced:** None — this level is pure navigation.

---

## Level 2 — Primitive Objects

**Goal:** Learn to add, transform, and combine Blender's built-in primitives (cube, sphere, cylinder, cone).

**Expected output:** A simple scene combining 3–5 primitives into a recognizable non-organic shape (a toy rocket, a simple robot, anything blocky).

**Skills learned:** `Shift+A` add menu, `G`/`R`/`S` transforms, axis-constrained transforms (`G` then `X`/`Y`/`Z`), Object Mode vs. Edit Mode (`Tab`), applying transforms (`Ctrl+A`).

**WindArms asset produced:** None — practice piece, not saved into `WindArms Assets/`.

---

## Level 3 — Sci-fi Crate

**Goal:** Build your first real, checklist-passing WindArms prop from primitives — a storage crate with beveled edges and panel detail, in the Art Bible's material language (Titanium/Brushed Steel panels, not painted wood).

**Expected output:** A single-mesh crate, correctly scaled (real-world meters), pivot at the base center, under 500 triangles, exported as a validated `.glb`.

**Skills learned:** Bevel, inset, extrude, the modifier stack (Bevel modifier specifically), naming objects/materials sanely, first real triangle-budget discipline, first real export following [`quality-checklist.md`](quality-checklist.md).

**WindArms asset produced:** A generic Sci-fi Crate — goes in `WindArms Assets/Props/Sci-fi Crate/`.

---

## Level 4 — Ammo Box

**Goal:** A second prop, slightly more complex — an ammo box with a hinged lid (even if the hinge doesn't animate yet), teaching multi-part assets and material variation on one mesh.

**Expected output:** A 2–3 part model (box + lid, optionally a latch), two distinct materials (Brushed Steel body, Ancient Alloy latch per the Art Bible's Material Library), correct pivot per part, `.glb` export.

**Skills learned:** Multi-object organization within one asset, material slots (multiple materials on one mesh vs. per-object), naming convention for multi-part assets, `Ctrl+J` (when parts should merge) vs. keeping them separate (when a part needs to move independently later — e.g. a lid that will eventually open).

**WindArms asset produced:** An Ammo Box prop — `WindArms Assets/Props/Ammo Box/`.

---

## Level 5 — Pistol

**Goal:** First weapon-shaped asset. Small enough to stay simple, but real enough to require sockets — the actual mechanic this pipeline is built around.

**Expected output:** A simple sidearm silhouette (chassis + barrel + grip), with a `socket_muzzle` empty correctly placed and oriented (−Z forward, per [`src/lib/v2/pipeline/README.md`](../../src/lib/v2/pipeline/README.md)), triangle budget under a weapon-category limit, validated `.glb`.

**Skills learned:** Empties as attachment points, naming empties to match a pipeline's socket convention exactly (`socket_muzzle`, not `Muzzle` or `muzzle_socket`), object orientation discipline, your first pass through the full quality checklist end to end.

**WindArms asset produced:** A generic training pistol — not a real WindArms weapon, `WindArms Assets/Weapons/Training Pistol/`.

---

## Level 6 — Rifle

**Goal:** A full-size weapon with multiple sockets and your first animation clips.

**Expected output:** A rifle-class mesh with `socket_muzzle`, `socket_ejection`, and `socket_magazine` all correctly placed, plus a basic `idle` and `fire` animation clip (even a simple recoil-and-return counts), named exactly per [`src/lib/v2/pipeline/README.md`](../../src/lib/v2/pipeline/README.md)'s `ClipName` convention.

**Skills learned:** Multiple sockets on one asset, basic keyframe animation, naming animation actions/clips so an exporter picks them up correctly, LOD thinking (start planning what a `.lod1` version of this asset would drop).

**WindArms asset produced:** A generic training rifle — `WindArms Assets/Weapons/Training Rifle/`.

---

## Level 7 — Hero Weapon

**Goal:** Produce a real, shippable WindArms weapon — this is the level where training becomes production. Reference: [`docs/design/weapons/vortex-rifle.md`](../design/weapons/vortex-rifle.md), the existing production blueprint.

**Expected output:** A complete Vortex Rifle (or the next weapon in the backlog — see [`docs/todo.md`](../todo.md)) matching its blueprint's material breakdown, dimensions, and silhouette; all required sockets; `idle`/`fire`/`reload`/`inspect` clips; LOD0 and LOD1 exports; a manifest entry ready to hand to engineering (see [`src/lib/v2/pipeline/manifest.ts`](../../src/lib/v2/pipeline/manifest.ts)'s `__template`).

**Skills learned:** Working from a written production blueprint instead of free design, full LOD authoring, full animation clip set, texture/material budget discipline at shippable quality, the complete concept-to-pipeline handoff.

**WindArms asset produced:** A real weapon — `WindArms Assets/Weapons/Vortex Rifle/` (or whichever blueprint is being built).

---

## Level 8 — Operator Equipment

**Goal:** Model gear for a character rather than a standalone weapon — armor pieces, a holster, a wearable accessory — introducing character sockets instead of weapon sockets.

**Expected output:** One or more equipment pieces sized to fit an operator rig, using `socket_hand_right`/`socket_head`/`socket_spine`-style attachment conventions (see [`src/lib/v2/pipeline/README.md`](../../src/lib/v2/pipeline/README.md)'s character socket list), matching the Art Bible's operator material language (§11 of [`art-bible.md`](../design/art-bible.md)).

**Skills learned:** Designing to fit an existing rig rather than a standalone silhouette, character-scale proportion discipline, working within an established character's established accent color (see [`docs/gameplay/operators.md`](../gameplay/operators.md)).

**WindArms asset produced:** Operator equipment — `WindArms Assets/Characters/<Operator>/Equipment/`.

---

## Level 9 — Environment Props

**Goal:** Scale up from hand-held objects to environment-scale set dressing — the props that make a Skyfront location feel inhabited (§8 of [`art-bible.md`](../design/art-bible.md): "islands should look inhabited, not sterile").

**Expected output:** A small prop set (crates, cabling, structural detail pieces) sized and weathered correctly for monumental architecture scale, with instancing/reuse in mind (one prop, many placements) rather than one-off unique geometry per placement.

**Skills learned:** Environment-scale proportion (see the Art Bible §26 Scale Reference), designing for instancing/reuse, triangle budgeting across a whole scene rather than one asset, texel-density consistency across a prop set.

**WindArms asset produced:** An environment prop set — `WindArms Assets/Props/<Set Name>/`, referenced from `WindArms Assets/Maps/<Location>/`.

---

## Level 10 — Hero Assets

**Goal:** A full hero-quality asset at the top of the production bar — a complete operator character, or a showcase-quality map centerpiece (a Wind Temple, a Storm Reactor) — everything below this level in service of reaching it.

**Expected output:** A complete, rigged, animated, fully-validated hero asset passing every item in [`quality-checklist.md`](quality-checklist.md) at the top budget tier, ready to move to `WindArms Assets/Showcase/` once approved.

**Skills learned:** Full production ownership — concept fidelity, rigging (for characters), a complete animation set, LOD authoring across 3 tiers, and the judgment to know when an asset is actually done versus merely finished.

**WindArms asset produced:** A hero-tier character or environment centerpiece — `WindArms Assets/Characters/<Operator>/` or `WindArms Assets/Maps/<Location>/Hero Assets/`.
