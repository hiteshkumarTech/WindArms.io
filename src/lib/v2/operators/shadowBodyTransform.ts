import { PLAYER } from '@/lib/game/constants';

/**
 * The shadow-only full body's world-local offset (Milestone 8, Step 8E-B) —
 * DELIBERATELY NOT `LOWERBODY_CANONICAL_LOCAL_OFFSET`
 * (`lowerBodyTransform.ts`). That constant's Y=-1.2m/Z=-0.5m combines a
 * derived capsule-to-feet term with a further empirical -0.2m/-0.5m
 * "silhouette" nudge — both of which exist ONLY to fix how the VISIBLE
 * lower body reads from the FIRST-PERSON camera at a near-vertical look
 * angle (the Step 8C.1 axial-viewing-angle finding: at steep pitch with
 * little forward offset, the camera looks almost straight down the leg's
 * length). A shadow is viewed from an EXTERNAL light angle, where that
 * problem does not exist — reusing the visible body's silhouette-motivated
 * offset would introduce a real, unnecessary displacement between the
 * shadow and its own caster's actual ground contact. This offset carries
 * ONLY the derived, physically-correct term: the Rapier `CapsuleCollider`'s
 * published world position is its CENTER; this asset's own local origin is
 * its FEET (same reconciliation `lowerBodyTransform.ts` documents at
 * length) — `-(PLAYER.HALF_HEIGHT + PLAYER.RADIUS)` = -1.0m is that
 * reconciliation and nothing more. No X, no Z, no yaw offset, no camera
 * input of any kind (this module has no pitch parameter, same guarantee
 * `lowerBodyTransform.ts`'s own tests lock in for the visible body).
 */
export const SHADOW_BODY_PHYSICAL_LOCAL_OFFSET: readonly [number, number, number] = [
  0,
  -(PLAYER.HALF_HEIGHT + PLAYER.RADIUS),
  0,
];
