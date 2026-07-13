import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050505',
        neon: {
          cyan: '#00F5FF',
          orange: '#FF7A00',
          purple: '#7C5CFF',
        },
        // V2 "War Above the Storm" palette — mirrors src/lib/v2/tokens.ts
        storm: {
          marble: '#EDEAE3',
          mist: '#C7CFD6',
          steel: '#8E99A4',
          slate: '#3E4A5A',
          abyss: '#0A1522',
          deep: '#12263C',
          mid: '#1E3A5C',
          blue: '#2E6FA3',
          sky: '#58B7E6',
          energy: '#4FC3FF',
          gold: '#E3A23C',
          golddeep: '#B8860B',
          crimson: '#B02E2E',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 22px rgba(0, 245, 255, 0.35)',
        'glow-orange': '0 0 22px rgba(255, 122, 0, 0.32)',
        'glow-purple': '0 0 22px rgba(124, 92, 255, 0.35)',
        'glow-gold': '0 0 26px rgba(227, 162, 60, 0.4)',
        'glow-sky': '0 0 22px rgba(88, 183, 230, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
