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

export interface DamageNumberRequest {
  at: [number, number, number];
  amount: number;
  headshot: boolean;
}

const tracerQueue: TracerRequest[] = [];
const impactQueue: ImpactRequest[] = [];
const damageNumberQueue: DamageNumberRequest[] = [];

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
  spawnDamageNumber(request: DamageNumberRequest): void {
    damageNumberQueue.push(request);
  },
  takeDamageNumbers(): DamageNumberRequest[] {
    return damageNumberQueue.splice(0, damageNumberQueue.length);
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

/**
 * Screen-shake trauma accumulator (0..1). Damage events add trauma;
 * PlayerController applies squared-trauma rotational noise to the camera
 * and decays it every frame.
 */
export const cameraShake = { trauma: 0 };

