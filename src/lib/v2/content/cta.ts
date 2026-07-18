/** Closing call-to-action + footer content. */

export const CTA = {
  eyebrow: 'DEPLOYMENT',
  title: 'THE SKY IS WAITING',
  subtitle:
    'Free in your browser. No downloads. Rise above the storm and take the fight to the floating megacities.',
  // Milestone 6: points at the V2 vertical slice (Skyfront Trial). See hero.ts.
  primaryCta: { label: 'Enter the Skyfront', href: '/v2/play' },
  secondaryCta: { label: 'Leaderboard', href: '/leaderboard' },
} as const;

export const FOOTER = {
  tagline: 'WindArms V2 — The War Above the Storm',
  build: 'Preview build — V1 remains live while V2 rises.',
  links: [
    { label: 'Play', href: '/v2/play' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Arsenal', href: '#arsenal' },
    { label: 'Operators', href: '#operators' },
    { label: 'Skyfront', href: '#skyfront' },
  ],
} as const;
