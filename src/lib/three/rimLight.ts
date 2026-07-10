import * as THREE from 'three';

/**
 * Shared fresnel rim-light shell material — a thin, slightly-scaled-up
 * duplicate mesh rendered additively over the base geometry so metal edges
 * catch a colored highlight at grazing angles. Written as a standalone
 * ShaderMaterial (matching SkyDome.tsx's precedent) rather than patching
 * MeshStandardMaterial's internal chunks via onBeforeCompile, so it never
 * needs to track three.js's internal shader layout across version bumps.
 * Purely additive/unlit — it doesn't participate in shadows or the
 * lighting pipeline, so it must only ever be layered on top of a properly
 * lit base mesh, never used as a substitute for one.
 */
export function createRimMaterial(color: string, intensity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewDirV;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDirV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewDirV;
      uniform vec3 uColor;
      uniform float uIntensity;
      void main() {
        float fresnel = pow(1.0 - clamp(dot(vNormalV, vViewDirV), 0.0, 1.0), 2.5);
        gl_FragColor = vec4(uColor, fresnel * uIntensity);
      }
    `,
  });
}
