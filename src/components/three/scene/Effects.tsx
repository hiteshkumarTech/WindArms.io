'use client';

import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';

/**
 * HDR post-processing stack: mipmap bloom for neon emissives,
 * subtle film grain and a soft vignette. Multisampling is disabled
 * because the composer renders to an offscreen buffer anyway.
 */
export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.22} luminanceSmoothing={0.18} radius={0.75} />
      <Noise opacity={0.04} />
      <Vignette eskil={false} offset={0.16} darkness={0.82} />
    </EffectComposer>
  );
}
