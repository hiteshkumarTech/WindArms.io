# WindArms Forge — Blender Shortcuts

The essential set — enough to get through [Level 1–3 of the training roadmap](training-roadmap.md). Not a complete Blender reference; just the keys you'll use in nearly every session.

| Key | Name | What it does |
|---|---|---|
| **G** | Grab (Move) | Moves the selected object/vertices/edges/faces. Press again after a direction letter to move freely; press `X`, `Y`, or `Z` right after to constrain to that axis (e.g. `G` then `X` moves only along X). |
| **R** | Rotate | Rotates the selection. Same axis-constraint trick as `G` — `R` then `Z` rotates only around Z. |
| **S** | Scale | Scales the selection up or down. Same axis-constraint trick — `S` then `Shift+Z` scales everything *except* Z. |
| **X** | Delete | Opens the delete menu (vertices/edges/faces in Edit Mode; objects in Object Mode). Note: immediately after `G`/`R`/`S`, pressing `X` instead constrains to the X axis — context matters. |
| **Shift+A** | Add menu | Adds a new object (mesh, light, camera, empty) at the 3D cursor. The starting point for every new piece of geometry. |
| **Tab** | Toggle Edit Mode | Switches between Object Mode (moving/scaling whole objects) and Edit Mode (moving individual vertices/edges/faces of the selected object). |
| **Ctrl+A** | Apply | Applies the object's current Location/Rotation/Scale as its new baseline (zeroing the transform without moving it visually). **Always do this before exporting** — see [`quality-checklist.md`](quality-checklist.md)'s Pivot section; an un-applied transform is the most common cause of an asset looking right in Blender and wrong in-engine. |
| **Ctrl+J** | Join | Merges the selected objects into one (the active object absorbs the rest). Use when parts should become one mesh; skip it when a part needs to move independently later (e.g. a lid, a rotating turbine). |
| **P** | Separate | The reverse of `Ctrl+J` — splits the current selection (in Edit Mode) out into its own new object. Useful for pulling a detail piece off a mesh to work on it independently. |
| **Alt+Z** | Toggle X-ray | Makes the mesh semi-transparent so you can select through it — essential for placing internal geometry (sockets, hidden mechanism detail) or selecting vertices behind others. |
