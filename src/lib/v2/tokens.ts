/**
 * STORM design tokens — the concept board's palette as TypeScript
 * constants, mirrored 1:1 by the `storm.*` Tailwind colors. Three.js
 * materials import from here so canvas and DOM can never drift.
 * When the Figma file lands, this is the single reconciliation point.
 */
export const STORM = {
  // Primary — marble & steel
  marble: '#EDEAE3',
  mist: '#C7CFD6',
  steel: '#8E99A4',
  slate: '#3E4A5A',
  // Secondary — storm blues
  abyss: '#0A1522',
  deep: '#12263C',
  mid: '#1E3A5C',
  blue: '#2E6FA3',
  sky: '#58B7E6',
  energy: '#4FC3FF',
  // Accents
  gold: '#E3A23C',
  goldDeep: '#B8860B',
  crimson: '#B02E2E',
  // Sky gradient stops (backdrop dome)
  skyZenith: '#16283E',
  skyMid: '#4E8DBE',
  skyHorizon: '#D9E7F2',
} as const;

export type StormToken = keyof typeof STORM;
