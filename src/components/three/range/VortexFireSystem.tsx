/**
 * MOVED 2026-07-17 (Milestone 6): the Vortex fire system now lives at
 * src/components/three/weapons/VortexFireSystem.tsx — it is the weapon's
 * single shared implementation (used by both /v2/range and /v2/play), not a
 * range-only system. This shim preserves the old import path (same
 * convention as storm/MarbleIslands.tsx's shim).
 */
export { default } from '@/components/three/weapons/VortexFireSystem';
