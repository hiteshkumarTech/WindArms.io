/**
 * Imperative bridges between game systems and the render loop.
 * Plain module singletons (not React state): producers push from event
 * handlers or the fire loop, consumers drain inside useFrame — zero
 * re-renders, zero subscription overhead on hot paths.
 */

export interface TracerRequest {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}

export interface ImpactRequest {
  at: [number, number, number];
  color: string;
}

const tracerQueue: TracerRequest[] = [];
const impactQueue: ImpactRequest[] = [];

export const effectsBus = {
  spawnTracer(request: TracerRequest): void {
    tracerQueue.push(request);
  },
  spawnImpact(request: ImpactRequest): void {
    impactQueue.push(request);
  },
  /** Drains and returns all pending tracer requests. */
  takeTracers(): TracerRequest[] {
    return tracerQueue.splice(0, tracerQueue.length);
  },
  takeImpacts(): ImpactRequest[] {
    return impactQueue.splice(0, impactQueue.length);
  },
};

/**
 * Weapon recoil accumulator. WeaponSystem adds kick on fire;
 * PlayerController consumes it into the camera angles each frame.
 */
export const viewKick = { pitch: 0, yaw: 0 };

/**
 * Viewmodel fire feedback: nonce increments per local shot so the
 * viewmodel can flash the muzzle and punch without prop drilling.
 */
export const fireSignal = { nonce: 0 };
