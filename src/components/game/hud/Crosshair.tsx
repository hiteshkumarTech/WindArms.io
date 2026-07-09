'use client';

import { useEffect, useRef } from 'react';
import { WEAPONS } from '@shared/weapons';
import { fireSignal } from '@/lib/game/effectsBus';
import { localPose } from '@/lib/game/localPose';
import { useCombatStore } from '@/stores/combatStore';
import { useWeaponStore } from '@/stores/weaponStore';

const BASE_GAP = 4; // resting inner gap (px)
const MAX_GAP = 30;
const BLOOM_DECAY = 7; // bloom settle rate (per second)
const BLOOM_MAX = 26;
const SMOOTH = 20; // gap easing rate
const HIT_FLASH_MS = 110;
const HIT_COLOR = '#00F5FF';
const IDLE_COLOR = 'rgba(255,255,255,0.9)';

/** Extra gap (px) added per movement state — you're less accurate on the move. */
const MOVE_GAP: Record<string, number> = {
  idle: 0,
  run: 6,
  sprint: 9,
  slide: 7,
  air: 12,
  dash: 11,
  wallrun: 10,
};

/**
 * Reactive crosshair: four lines that bloom apart with movement and each shot,
 * then settle when you hold still — a live read on your accuracy. The reticle
 * flashes cyan on a confirmed hit. Driven entirely in a requestAnimationFrame
 * loop from module signals (movement pose, fire nonce, hit nonce), so it never
 * triggers a React re-render.
 */
export default function Crosshair() {
  const top = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let gap = BASE_GAP;
    let bloom = 0;
    let lastFire = fireSignal.nonce;
    let lastHit = useCombatStore.getState().hitmarkerNonce;
    let flashUntil = 0;

    const loop = (t: number) => {
      const dt = Math.min((t - prev) / 1000, 0.05);
      prev = t;

      // Firing bloom: each new shot adds spread scaled by the weapon's cone.
      if (fireSignal.nonce !== lastFire) {
        const shots = fireSignal.nonce - lastFire;
        lastFire = fireSignal.nonce;
        const spread = WEAPONS[useWeaponStore.getState().current].spreadDeg;
        bloom = Math.min(bloom + shots * (1.5 + spread * 1.6), BLOOM_MAX);
      }
      bloom = Math.max(0, bloom - bloom * BLOOM_DECAY * dt);

      const move = MOVE_GAP[localPose.state] ?? 0;
      const target = Math.min(BASE_GAP + move + bloom, MAX_GAP);
      gap += (target - gap) * (1 - Math.exp(-SMOOTH * dt));

      // Hit confirmation flash (reads the same nonce as the X hitmarker).
      const hitNonce = useCombatStore.getState().hitmarkerNonce;
      if (hitNonce !== lastHit) {
        lastHit = hitNonce;
        flashUntil = t + HIT_FLASH_MS;
      }
      const color = t < flashUntil ? HIT_COLOR : IDLE_COLOR;

      const g = Math.round(gap);
      if (top.current) {
        top.current.style.transform = `translate(-50%, calc(-100% - ${g}px))`;
        top.current.style.backgroundColor = color;
      }
      if (bottom.current) {
        bottom.current.style.transform = `translate(-50%, ${g}px)`;
        bottom.current.style.backgroundColor = color;
      }
      if (left.current) {
        left.current.style.transform = `translate(calc(-100% - ${g}px), -50%)`;
        left.current.style.backgroundColor = color;
      }
      if (right.current) {
        right.current.style.transform = `translate(${g}px, -50%)`;
        right.current.style.backgroundColor = color;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
      <div className="relative h-0 w-0">
        <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
        <span
          ref={top}
          className="absolute left-1/2 top-1/2 h-2 w-0.5 rounded-full bg-white/90"
          style={{ transform: `translate(-50%, calc(-100% - ${BASE_GAP}px))` }}
        />
        <span
          ref={bottom}
          className="absolute left-1/2 top-1/2 h-2 w-0.5 rounded-full bg-white/90"
          style={{ transform: `translate(-50%, ${BASE_GAP}px)` }}
        />
        <span
          ref={left}
          className="absolute left-1/2 top-1/2 h-0.5 w-2 rounded-full bg-white/90"
          style={{ transform: `translate(calc(-100% - ${BASE_GAP}px), -50%)` }}
        />
        <span
          ref={right}
          className="absolute left-1/2 top-1/2 h-0.5 w-2 rounded-full bg-white/90"
          style={{ transform: `translate(${BASE_GAP}px, -50%)` }}
        />
      </div>
    </div>
  );
}
