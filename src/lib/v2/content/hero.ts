/** Hero section content — copy only, no presentation logic. */

export const HERO = {
  eyebrow: 'WINDARMS V2 — PREVIEW',
  titleLines: ['THE WAR', 'ABOVE THE STORM'],
  /** Board lore, canonical. */
  lore: 'Humanity’s last civilization exists above an endless storm. Ancient wind technology and monumental architecture keep us alive. Battles are fought in the skies, on floating megacities, and between the clouds.',
  // Milestone 6: the V2 landing's primary Play now opens the V2 vertical
  // slice (/v2/play — Skyfront Trial), not V1's /play. V1 stays live and
  // untouched at /play; /v2/range remains a developer route.
  primaryCta: { label: 'Play Free Now', href: '/v2/play' },
  secondaryCta: { label: 'View the Skyfront', href: '#skyfront' },
  scrollCue: 'Descend',
} as const;

/** Boot sequence lines (preloader). Order matters. */
export const BOOT_LINES = [
  'Initializing Wind Core…',
  'Loading Atmospheric Systems…',
  'Calibrating Airship Docks…',
  'Charging Storm Reactors…',
  'Entering Sky Civilization…',
] as const;
