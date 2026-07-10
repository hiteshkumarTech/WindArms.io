'use client';

import { Bloom, BrightnessContrast, EffectComposer, SSAO, Vignette } from '@react-three/postprocessing';
import { MAPS } from '@shared/maps';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

/**
 * Gameplay post-processing: mipmap bloom for neon emissives (accent strips,
 * tracers, muzzle flashes), a subtle contact-occlusion pass, per-map
 * contrast grading, and a gentle framing vignette. Tuned far more
 * conservatively than the landing page's decorative stack (`Effects` in
 * src/components/three/scene) — bloom must never wash out a distant enemy
 * silhouette, AO stays gentle so it reads as depth cues rather than
 * dirty-looking halos, and the vignette (offset 0.32 / darkness 0.35) is
 * far softer than the landing page's (0.16 / 0.82) since peripheral vision
 * is functionally important in a shooter. Mounted only at the 'high'
 * quality tier (see GameCanvas) since every pass here costs real GPU time.
 */
export default function GameEffects() {
  const mapId = useMultiplayerStore((state) => state.mapId);
  const contrast = MAPS[mapId].theme.contrast ?? 0;

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
      <BrightnessContrast contrast={contrast} />
      <Vignette eskil={false} offset={0.32} darkness={0.35} />
    </EffectComposer>
  );
}
