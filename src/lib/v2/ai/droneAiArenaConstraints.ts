import type { Vec3Data } from './droneAiTypes';
import type { DroneArenaConfig } from './droneArenaConfig';

/**
 * Milestone 9F — pure arena-constraint module. Same guarantee as the rest of
 * `lib/v2/ai/` — no React, no R3F, no Three.js, no Rapier, no Zustand, no
 * browser globals, no `Math.random`/`performance.now`/`Date.now` (enforced
 * by `droneAiImportGuards.test.ts`). Plain `{x,y,z}` data only.
 *
 * SCOPE: this module answers exactly one question — "given where a drone
 * CURRENTLY is and where it PROPOSES to move this substep, what position
 * should actually be committed?" It knows nothing about combat state, attack
 * timing, perception, telegraphs, difficulty, or squad coordination — those
 * all live elsewhere. It is called ONCE per drone per fixed substep, AFTER
 * `resolveDroneMovementIntent()` has already produced a proposed position
 * (base tactical intent + 9D local separation, already resolved) and BEFORE
 * that position is committed to the drone's own tactical `positionRef` — see
 * `DroneEnemy.tsx`'s own `update()` for the exact call order.
 *
 * NOT obstacle avoidance, not navmesh, not pathfinding: this module only
 * ever clamps/projects a SINGLE proposed point against static, source-derived
 * arena data (`droneArenaConfig.ts`) — a box clamp plus one or more cylinder
 * projections. It never reasons about a path BETWEEN two points, never
 * queries cover geometry, and never blocks on anything other than the
 * horizontal envelope, the altitude band, and the Wind Lift exclusion zone.
 *
 * APPLICATION ORDER (matches the constraint pipeline's own three concerns,
 * each independently testable): horizontal clamp → altitude clamp → forbidden-
 * zone (Wind Lift) projection. Altitude is resolved BEFORE the forbidden-zone
 * check so the zone's own vertical band test always sees the already-valid Y
 * — "preserve the proposed Y value subject to altitude limits" (Wind Lift
 * correction is horizontal/XZ-only, never imparts a Y impulse).
 */

export interface DroneConstraintInput {
  droneId: string;
  currentPosition: Vec3Data;
  proposedPosition: Vec3Data;
  config: DroneArenaConfig;
}

export interface DroneConstraintResult {
  position: Vec3Data;
  horizontalClamped: boolean;
  altitudeClamped: boolean;
  forbiddenZoneCorrected: boolean;
  /** Total distance between the ORIGINAL proposed position and the final committed position — 0 when nothing was corrected. */
  correctionDistanceM: number;
  /** How much of the intended displacement (|proposed-current|) was lost to correction — max(0, intendedDisplacement - actualCommittedDisplacement). */
  blockedDisplacementM: number;
}

function isFiniteVec(v: Vec3Data): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function vecLength(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function isValidBounds(config: DroneArenaConfig): boolean {
  const b = config.horizontalBounds;
  return (
    Number.isFinite(b.minX) &&
    Number.isFinite(b.maxX) &&
    Number.isFinite(b.minZ) &&
    Number.isFinite(b.maxZ) &&
    b.minX < b.maxX &&
    b.minZ < b.maxZ &&
    Number.isFinite(config.minAltitudeM) &&
    Number.isFinite(config.maxAltitudeM) &&
    config.minAltitudeM < config.maxAltitudeM
  );
}

/**
 * Small, local, dependency-free FNV-1a-style hash — deliberately NOT
 * imported from `droneAiMovementIntent.ts` (protected, and this module is
 * intentionally decoupled from it — see this file's own doc comment). Pure
 * function of the input string only.
 */
function hashDroneId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic fallback direction for the degenerate "exactly at the forbidden zone's centre" case — a pure function of the drone's own stable ID, never RNG, never a clock. */
function centreFallbackDirection(droneId: string): { x: number; z: number } {
  const angle = (hashDroneId(droneId) / 0xffffffff) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function holdResult(position: Vec3Data, output?: DroneConstraintResult): DroneConstraintResult {
  const out = output ?? { position: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false, correctionDistanceM: 0, blockedDisplacementM: 0 };
  out.position = { x: position.x, y: position.y, z: position.z };
  out.horizontalClamped = false;
  out.altitudeClamped = false;
  out.forbiddenZoneCorrected = false;
  out.correctionDistanceM = 0;
  out.blockedDisplacementM = 0;
  return out;
}

/**
 * The one per-substep pure constraint resolver. Deterministic given
 * identical inputs — no RNG, no clock. `output`, when supplied, is reused in
 * place rather than allocating a fresh result object every call.
 *
 * SAFE-INPUT CONTRACT: never throws, never returns NaN/Infinity, never
 * silently produces `(0,0,0)` unless every other available fallback
 * (current position, config bounds) is itself invalid — see the guard
 * cascade below.
 */
export function constrainDronePosition(input: DroneConstraintInput, output?: DroneConstraintResult): DroneConstraintResult {
  const { config } = input;
  const boundsValid = isValidBounds(config);
  const currentValid = isFiniteVec(input.currentPosition);

  if (!boundsValid || !currentValid) {
    // Defensive fail-safe: with no trustworthy bounds/current position to
    // reason about, hold at whatever finite position is available rather
    // than risk propagating NaN/Infinity or an invented (0,0,0) teleport.
    if (currentValid) return holdResult(input.currentPosition, output);
    const fallback = config.safeFallbackPositions.find(isFiniteVec);
    return holdResult(fallback ?? { x: 0, y: 0, z: 0 }, output);
  }

  const proposed = isFiniteVec(input.proposedPosition) ? input.proposedPosition : input.currentPosition;

  const b = config.horizontalBounds;
  const clampedX = clamp(proposed.x, b.minX, b.maxX);
  const clampedZ = clamp(proposed.z, b.minZ, b.maxZ);
  const horizontalClamped = clampedX !== proposed.x || clampedZ !== proposed.z;

  const clampedY = clamp(proposed.y, config.minAltitudeM, config.maxAltitudeM);
  const altitudeClamped = clampedY !== proposed.y;

  let finalX = clampedX;
  let finalZ = clampedZ;
  const finalY = clampedY;
  let forbiddenZoneCorrected = false;

  for (const zone of config.forbiddenZones) {
    if (!Number.isFinite(zone.centerX) || !Number.isFinite(zone.centerZ) || !Number.isFinite(zone.radiusM) || zone.radiusM <= 0) continue;
    if (finalY < zone.minY || finalY > zone.maxY) continue;

    const dx = finalX - zone.centerX;
    const dz = finalZ - zone.centerZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > zone.radiusM * zone.radiusM) continue;

    const dist = Math.sqrt(distSq);
    const pushRadius = zone.radiusM + config.hardBoundaryEpsilonM;
    if (dist > config.hardBoundaryEpsilonM) {
      const scale = pushRadius / dist;
      finalX = zone.centerX + dx * scale;
      finalZ = zone.centerZ + dz * scale;
    } else {
      const fallback = centreFallbackDirection(input.droneId);
      finalX = zone.centerX + fallback.x * pushRadius;
      finalZ = zone.centerZ + fallback.z * pushRadius;
    }
    // Re-clamp to the horizontal envelope — a zone near the arena edge must
    // never have its own projection push a drone back out of bounds.
    finalX = clamp(finalX, b.minX, b.maxX);
    finalZ = clamp(finalZ, b.minZ, b.maxZ);
    forbiddenZoneCorrected = true;
  }

  const out = output ?? { position: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false, correctionDistanceM: 0, blockedDisplacementM: 0 };
  out.position.x = finalX;
  out.position.y = finalY;
  out.position.z = finalZ;
  out.horizontalClamped = horizontalClamped;
  out.altitudeClamped = altitudeClamped;
  out.forbiddenZoneCorrected = forbiddenZoneCorrected;

  const dCx = finalX - proposed.x;
  const dCy = finalY - proposed.y;
  const dCz = finalZ - proposed.z;
  out.correctionDistanceM = vecLength(dCx, dCy, dCz);

  const intendedDisplacement = vecLength(proposed.x - input.currentPosition.x, proposed.y - input.currentPosition.y, proposed.z - input.currentPosition.z);
  const committedDisplacement = vecLength(finalX - input.currentPosition.x, finalY - input.currentPosition.y, finalZ - input.currentPosition.z);
  out.blockedDisplacementM = Math.max(0, intendedDisplacement - committedDisplacement);

  return out;
}
