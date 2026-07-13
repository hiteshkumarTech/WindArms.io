/** Operators section content. Art slots: public/v2-art/operator-{n}. */

export const OPERATORS_HEADING = {
  eyebrow: 'ELITE OPERATORS',
  title: 'CHOOSE YOUR WARDEN',
  subtitle: 'Original operators forged for the skyfront — each with a silhouette you can read across a battlefield.',
} as const;

export interface OperatorContent {
  id: string;
  name: string;
  role: string;
  bio: string;
  signatureWeapon: string;
  accent: string;
  artSlot: string;
  /** Fallback monogram when no art is present. */
  monogram: string;
}

export const OPERATORS: OperatorContent[] = [
  {
    id: 'kael',
    name: 'KAEL AURIN',
    role: 'Temple Warden',
    bio: 'Guardian of the Wind Temple’s inner sanctum. Fights patient and vertical — the high ground was never optional.',
    signatureWeapon: 'Aeolus Rifle',
    accent: '#4FC3FF',
    artSlot: 'operator-1',
    monogram: 'K',
  },
  {
    id: 'veyra',
    name: 'VEYRA SOLACE',
    role: 'Tempest Vanguard',
    bio: 'First through every breach, riding wind currents the way others ride gravity. Momentum is her doctrine.',
    signatureWeapon: 'Vortex Carbine',
    accent: '#E3A23C',
    artSlot: 'operator-2',
    monogram: 'V',
  },
];
