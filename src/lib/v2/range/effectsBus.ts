/**
 * Imperative effects bridge for the V2 weapon range — same
 * producer-pushes/consumer-drains module-singleton pattern as v1's
 * `src/lib/game/effectsBus.ts`, trimmed to what a single-weapon test range
 * actually needs (no damage numbers, explosions, or heat shimmer — nothing
 * here asked for them). Kept as its own module, not imported from v1, so
 * `/play` and `/v2/range` can never share VFX queues.
 */

export interface TracerRequest {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}

export interface ImpactRequest {
  at: [number, number, number];
  color: string;
  normal?: [number, number, number];
}

export interface CasingRequest {
  at: [number, number, number];
  dir: [number, number, number];
}

const tracerQueue: TracerRequest[] = [];
const impactQueue: ImpactRequest[] = [];
const casingQueue: CasingRequest[] = [];

export const effectsBus = {
  spawnTracer(request: TracerRequest): void {
    tracerQueue.push(request);
  },
  takeTracers(): TracerRequest[] {
    return tracerQueue.splice(0, tracerQueue.length);
  },
  spawnImpact(request: ImpactRequest): void {
    impactQueue.push(request);
  },
  takeImpacts(): ImpactRequest[] {
    return impactQueue.splice(0, impactQueue.length);
  },
  spawnCasing(request: CasingRequest): void {
    casingQueue.push(request);
  },
  takeCasings(): CasingRequest[] {
    return casingQueue.splice(0, casingQueue.length);
  },
};

/** Fire feedback nonce — the viewmodel punches/flashes off this without prop drilling. */
export const fireSignal = { nonce: 0 };

/** Reload start/finish nonces — the viewmodel's reload-dip curve reads these. */
export const reloadSignal = { startNonce: 0, finishNonce: 0 };
