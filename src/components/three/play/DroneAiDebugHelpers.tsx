'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { DRONE_ARENA_CONFIG } from '@/lib/v2/ai/droneArenaConfig';
import { listDroneAiDebugDrones, type DroneAiDebugRuntime } from '@/lib/v2/ai/droneAiDebugState';
import { useDroneAiDebugHelperToggles } from '@/lib/v2/ai/droneAiDebugHelperToggles';

/**
 * Milestone 9H — dev-only, VISUAL-ONLY Drone AI debug helpers. Mounted by
 * `V2PlayScene.tsx` inside the Canvas, behind `useDroneAiDebugEnabled()`,
 * exactly like `VortexGripAnchorDebug.tsx` is mounted behind
 * `useGripDebugEnabled()` — that file's own "caller decides visibility, the
 * helper itself does no gating" precedent, and its `raycast={() => null}`
 * combat-target-exclusion convention, are both reused here directly.
 *
 * READS ONLY `droneAiDebugState.ts`'s already-written telemetry — never
 * evaluates perception/movement/recovery/coordination itself, never feeds
 * anything back into any gameplay module or ref. Positions come from
 * `tacticalPosition`/`visualPosition`/`lastKnownPosition`, all copies the
 * adapter already wrote — this component never reads a `THREE.Vector3` or
 * ref belonging to `DroneEnemy.tsx`/`DroneSquad.tsx` directly.
 *
 * POOLING (Section 8's "helper allocation count bounded" / "repeated
 * toggles do not grow resources"): a FIXED pool of `MAX_HELPER_SLOTS`
 * per-drone slots is created ONCE via `useMemo` — sized to comfortably
 * exceed the real production roster (max 8, per `resolveDroneSpawns`) and
 * this milestone's own 16/24-drone DIAGNOSTIC ceiling (Section 13), so a
 * diagnostic run never needs to grow the pool at runtime. Slots beyond the
 * CURRENT live drone count are simply hidden (`visible = false`), never
 * destroyed/recreated. Geometry/materials for every slot's arrow/line/
 * marker meshes are allocated exactly once, in this same `useMemo` — the
 * per-frame update loop below only ever WRITES into already-allocated
 * buffer-attribute arrays and calls `ArrowHelper.setDirection()`/
 * `.setLength()` (both mutate in place, no allocation).
 *
 * A SINGLE squad-level `useFrame` drives every slot (mirrors
 * `DroneSquad.tsx`'s own "one shared frame loop, not N per-entity loops"
 * convention) — this is the "One dev-only presentation useFrame" Section 8
 * describes: it exists only while this component is mounted (i.e. only
 * while the debug flag is armed), performs no gameplay work, writes no
 * React state on the hot path, and is removed on unmount along with
 * everything else this component owns.
 */
const MAX_HELPER_SLOTS = 24;

const STATE_HEX: Record<string, number> = {
  spawning: 0x999999,
  searching: 0xcccccc,
  investigating: 0xffb84d,
  engaging: 0x4fc3ff,
  attacking: 0xff5050,
  destroyed: 0x555555,
};

const STORM_ENERGY_HEX = 0x4fc3ff;

interface HelperSlot {
  anchor: THREE.Group;
  arrow: THREE.ArrowHelper;
  lineGeometry: THREE.BufferGeometry;
  lineMaterial: THREE.LineBasicMaterial;
  line: THREE.Line;
  leaseMarker: THREE.Mesh;
  leaseMaterial: THREE.MeshBasicMaterial;
  recoveryMarker: THREE.Mesh;
  memoryMarker: THREE.Mesh;
}

function createHelperSlot(): HelperSlot {
  const anchor = new THREE.Group();
  anchor.visible = false;

  // Milestone 9H.1 — CORRECTION: `THREE.ArrowHelper` is a `Group` containing
  // its OWN internal `.line` (shaft, type `Line`) and `.cone` (head, type
  // `Mesh`) children, added by ArrowHelper's own constructor — these are
  // real, independently-raycastable geometry the initial 9H pass never
  // excluded (only the OTHER pooled helper objects — line/leaseMarker/
  // recoveryMarker/memoryMarker — got the `raycast = () => {}` no-op
  // override below). A real-browser Section-4 validation trace
  // (docs/decisions.md's 9H.1 entry) proved the arrow's shaft DOES appear
  // in a real `raycaster.intersectObjects(scene.children, true)` result
  // when `movementArrows` is enabled — it never actually displaced a real
  // drone hit from `hits[0]` in that trace (the drone's own solid geometry
  // was always closer), but a different camera angle/distance could not be
  // ruled out without this fix. All three objects (the arrow group itself,
  // plus both real children) are excluded for defense in depth.
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, STORM_ENERGY_HEX, 0.25, 0.15);
  arrow.visible = false;
  arrow.raycast = () => {};
  arrow.line.raycast = () => {};
  arrow.cone.raycast = () => {};
  anchor.add(arrow);

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.6 });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.visible = false;
  line.raycast = () => {};
  anchor.add(line);

  const leaseMaterial = new THREE.MeshBasicMaterial({ color: 0xffd15c, toneMapped: false });
  const leaseMarker = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 16), leaseMaterial);
  leaseMarker.rotation.x = -Math.PI / 2;
  leaseMarker.visible = false;
  leaseMarker.raycast = () => {};
  anchor.add(leaseMarker);

  const recoveryMarker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.7, toneMapped: false }));
  recoveryMarker.visible = false;
  recoveryMarker.raycast = () => {};
  anchor.add(recoveryMarker);

  const memoryMarker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.55, wireframe: true, toneMapped: false }));
  memoryMarker.visible = false;
  memoryMarker.raycast = () => {};
  anchor.add(memoryMarker);

  return { anchor, arrow, lineGeometry, lineMaterial, line, leaseMarker, leaseMaterial, recoveryMarker, memoryMarker };
}

export default function DroneAiDebugHelpers({ runtime }: { runtime: DroneAiDebugRuntime }) {
  const rootRef = useRef<THREE.Group>(null);
  const labelGroupRefs = useRef<Array<THREE.Group | null>>([]);
  const labelTextRefs = useRef<Array<HTMLDivElement | null>>([]);

  const pool = useMemo<HelperSlot[]>(() => Array.from({ length: MAX_HELPER_SLOTS }, () => createHelperSlot()), []);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const toggles = useDroneAiDebugHelperToggles.getState();
    const drones = listDroneAiDebugDrones(runtime);

    for (let i = 0; i < pool.length; i++) {
      const slot = pool[i];
      const labelGroup = labelGroupRefs.current[i];
      const drone = i < drones.length ? drones[i] : null;

      if (!drone) {
        slot.anchor.visible = false;
        if (labelGroup) labelGroup.visible = false;
        continue;
      }

      slot.anchor.visible = true;
      slot.anchor.position.set(drone.visualPosition.x, drone.visualPosition.y, drone.visualPosition.z);
      if (labelGroup) {
        labelGroup.visible = toggles.stateLabels;
        labelGroup.position.copy(slot.anchor.position);
      }
      const labelText = labelTextRefs.current[i];
      if (labelText) {
        const nextText = `${drone.id} — ${drone.runtimeState}`;
        if (labelText.textContent !== nextText) labelText.textContent = nextText;
        const color = `#${STATE_HEX[drone.runtimeState]?.toString(16).padStart(6, '0') ?? 'ffffff'}`;
        if (labelText.style.color !== color) labelText.style.color = color;
      }

      // Target / memory line — engaged/attacking drones draw a line to the
      // live target position; investigating drones draw one to their own
      // last-known position instead. Neither is shown otherwise.
      const showLine =
        toggles.targetLines &&
        ((drone.targetVisible && (drone.runtimeState === 'engaging' || drone.runtimeState === 'attacking')) ||
          (drone.runtimeState === 'investigating' && drone.lastKnownPosition !== null));
      slot.line.visible = showLine;
      if (showLine) {
        const endpoint = drone.runtimeState === 'investigating' ? drone.lastKnownPosition! : drone.tacticalPosition;
        const attrPositions = slot.lineGeometry.attributes.position as THREE.BufferAttribute;
        // Local-space line from this slot's own anchor origin (0,0,0) to the
        // endpoint expressed relative to the anchor's current world position
        // — avoids a second world-space transform, mirrors
        // `VortexGripAnchorDebug.tsx`'s own "parent group carries the
        // transform, children stay local" convention.
        attrPositions.setXYZ(0, 0, 0, 0);
        attrPositions.setXYZ(1, endpoint.x - slot.anchor.position.x, endpoint.y - slot.anchor.position.y, endpoint.z - slot.anchor.position.z);
        attrPositions.needsUpdate = true;
        slot.lineMaterial.color.setHex(drone.runtimeState === 'investigating' ? 0xffb84d : 0x4fc3ff);
      }

      // Movement arrow — the ACTUAL committed displacement this tick
      // (`finalMovement`), never the raw pre-constraint intent, per Section
      // 8's own "verify the arrows represent the final applied movement"
      // requirement.
      const speed = Math.sqrt(drone.finalMovement.x ** 2 + drone.finalMovement.y ** 2 + drone.finalMovement.z ** 2);
      const showArrow = toggles.movementArrows && speed > 1e-5;
      slot.arrow.visible = showArrow;
      if (showArrow) {
        slot.arrow.setDirection(new THREE.Vector3(drone.finalMovement.x, drone.finalMovement.y, drone.finalMovement.z).normalize());
        slot.arrow.setLength(Math.min(2.5, 0.4 + speed * 6), 0.25, 0.15);
      }

      // Lease/sector marker — a ring under the drone, colored by sector.
      const showLease = toggles.leaseSectorMarkers && drone.hasAttackLease;
      slot.leaseMarker.visible = showLease;
      if (showLease && drone.sectorIndex !== null) {
        const hue = (drone.sectorIndex * 47) % 360;
        slot.leaseMaterial.color.setHSL(hue / 360, 0.8, 0.6);
      }

      // Recovery marker — a small pulsing-red sphere while an active
      // recovery episode (nudge/back-away/altitude-correct/teleport) is
      // underway; never shown for idle/cooldown.
      const recoveryActive = drone.recoveryPhase !== 'idle' && drone.recoveryPhase !== 'cooldown';
      slot.recoveryMarker.visible = toggles.recoveryMarkers && recoveryActive;
      if (slot.recoveryMarker.visible) slot.recoveryMarker.position.set(0, 0.9, 0);

      // Last-known-position memory marker — only while genuinely
      // investigating with real memory (never fabricated).
      const showMemory = toggles.targetLines && drone.runtimeState === 'investigating' && drone.lastKnownPosition !== null;
      slot.memoryMarker.visible = showMemory;
      if (showMemory) {
        const lk = drone.lastKnownPosition!;
        slot.memoryMarker.position.set(lk.x - slot.anchor.position.x, lk.y - slot.anchor.position.y, lk.z - slot.anchor.position.z);
      }
    }
  });

  const arenaOutline = useMemo(() => buildArenaOutlinePoints(), []);
  const toggles = useDroneAiDebugHelperToggles();

  return (
    <group ref={rootRef} name="drone_ai_debug_helpers">
      {pool.map((slot, i) => (
        <primitive key={i} object={slot.anchor} />
      ))}
      {pool.map((_, i) => (
        <group
          key={`label-${i}`}
          ref={(el) => {
            labelGroupRefs.current[i] = el;
          }}
          visible={false}
        >
          <Html center distanceFactor={18} occlude={false} style={{ pointerEvents: 'none' }}>
            <div
              ref={(el) => {
                labelTextRefs.current[i] = el;
              }}
              className="whitespace-nowrap rounded border border-white/10 bg-black/55 px-1.5 py-0.5 text-[10px] font-mono font-semibold"
            />
          </Html>
        </group>
      ))}
      {toggles.arenaBounds && (
        <group raycast={() => null}>
          <Line points={arenaOutline.horizontal} color="#4fc3ff" transparent opacity={0.35} />
          {arenaOutline.windLift.length > 0 && <Line points={arenaOutline.windLift} color="#ffb84d" transparent opacity={0.4} />}
        </group>
      )}
    </group>
  );
}

/** Static outline geometry (never updates per frame) — a rectangular prism at min/max altitude for the horizontal envelope, plus a vertical circle loop for the Wind Lift exclusion cylinder. Both derived directly from `DRONE_ARENA_CONFIG` — the SAME source `droneAiArenaConstraints.ts` clamps real drone movement against — never a second, independently-eyeballed set of numbers. */
function buildArenaOutlinePoints(): { horizontal: [number, number, number][]; windLift: [number, number, number][] } {
  const b = DRONE_ARENA_CONFIG.horizontalBounds;
  const yMin = DRONE_ARENA_CONFIG.minAltitudeM;
  const yMax = DRONE_ARENA_CONFIG.maxAltitudeM;
  const corners: [number, number][] = [
    [b.minX, b.minZ],
    [b.maxX, b.minZ],
    [b.maxX, b.maxZ],
    [b.minX, b.maxZ],
    [b.minX, b.minZ],
  ];
  const horizontal: [number, number, number][] = [];
  for (const [x, z] of corners) horizontal.push([x, yMin, z]);
  for (const [x, z] of corners) horizontal.push([x, yMax, z]);

  const zone = DRONE_ARENA_CONFIG.forbiddenZones[0];
  const windLift: [number, number, number][] = [];
  if (zone) {
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      windLift.push([zone.centerX + Math.cos(angle) * zone.radiusM, zone.minY, zone.centerZ + Math.sin(angle) * zone.radiusM]);
    }
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      windLift.push([zone.centerX + Math.cos(angle) * zone.radiusM, zone.maxY, zone.centerZ + Math.sin(angle) * zone.radiusM]);
    }
  }
  return { horizontal, windLift };
}
