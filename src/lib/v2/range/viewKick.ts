/**
 * V2 range-scene weapon recoil accumulator — same singleton-bridge pattern
 * as v1's `src/lib/game/effectsBus.ts` (`viewKick`/`cameraShake`), kept as
 * its own module rather than importing v1's so the two scenes can never
 * cross-pollute recoil state if both are ever mounted in the same tab.
 *
 * VortexFireSystem adds kick on fire; RangeController consumes it into the
 * camera angles each frame and zeroes it — punch-and-hold, no auto-recover.
 */
export const viewKick = { pitch: 0, yaw: 0 };
