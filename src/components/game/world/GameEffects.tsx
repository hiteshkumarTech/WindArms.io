'use client';

import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing';

/**
 * Gameplay post-processing: mipmap bloom for neon emissives (accent strips,
 * tracers, muzzle flashes) and a subtle contact-occlusion pass. Tuned far
 * more conservatively than the landing page's decorative stack (`Effects`
 * in src/components/three/scene) — bloom must never wash out a distant
 * enemy silhouette, and AO stays gentle so it reads as depth cues rather
 * than dirty-looking halos. Mounted only at the 'high' quality tier
 * (see GameCanvas) since both passes cost real GPU time.
 */
export default function GameEffects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.5} luminanceThreshold={0.35} luminanceSmoothing={0.2} radius={0.55} />
      <SSAO
        worldDistanceThreshold={1}
        worldDistanceFalloff={0.5}
        worldProximityThreshold={0.4}
        worldProximityFalloff={0.2}
        intensity={2.5}
        radius={6}
        bias={0.035}
        luminanceInfluence={0.7}
      />
    </EffectComposer>
  );
}
