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
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 22px rgba(0, 245, 255, 0.35)',
        'glow-orange': '0 0 22px rgba(255, 122, 0, 0.32)',
        'glow-purple': '0 0 22px rgba(124, 92, 255, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
