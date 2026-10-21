/**
 * Wache — Tailwind config aligned with responsive system
 * Breakpoints: Mobile (320–767) | Tablet (768–1279) | Desktop (1280+)
 * Install: npm i -D tailwindcss postcss autoprefixer
 * Use with: @tailwind base; @tailwind components; @tailwind utilities;
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'media', // or 'class' for manual toggle
  theme: {
    screens: {
      /* Mobile */
      'xs': '320px',    // 320–374
      'sm': '375px',    // 375–424
      'md': '425px',    // 425–767
      /* Tablet */
      'lg': '768px',    // 768–1023 portrait
      'xl': '1024px',   // 1024–1279 landscape
      /* Desktop */
      '2xl': '1280px',  // 1280–1439
      '3xl': '1440px',  // 1440–1919
      '4xl': '1920px',  // 1920+
    },
    maxWidth: {
      'container-sm': '720px',
      'container-md': '960px',
      'container': '1200px',
      'container-lg': '1320px',
      'container-xl': '1400px',
      'full': '100%',
    },
    spacing: {
      /* 4px base unit */
      '0': '0',
      '1': '0.25rem',   /* 4px */
      '2': '0.5rem',    /* 8px */
      '3': '0.75rem',   /* 12px */
      '4': '1rem',      /* 16px */
      '5': '1.25rem',   /* 20px */
      '6': '1.5rem',    /* 24px */
      '8': '2rem',      /* 32px */
      '10': '2.5rem',   /* 40px */
      '12': '3rem',     /* 48px */
      '16': '4rem',     /* 64px */
      'touch': '2.75rem', /* 44px min touch target */
    },
    fontSize: {
      'xs': ['clamp(0.6875rem, 0.65rem + 0.2vw, 0.75rem)', { lineHeight: '1.5' }],
      'sm': ['clamp(0.8125rem, 0.775rem + 0.2vw, 0.875rem)', { lineHeight: '1.5' }],
      'base': ['clamp(0.875rem, 0.825rem + 0.25vw, 1rem)', { lineHeight: '1.5' }],
      'lg': ['clamp(1rem, 0.9rem + 0.5vw, 1.125rem)', { lineHeight: '1.375' }],
      'xl': ['clamp(1.125rem, 1rem + 0.6vw, 1.25rem)', { lineHeight: '1.375' }],
      '2xl': ['clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)', { lineHeight: '1.375' }],
      '3xl': ['clamp(1.5rem, 1.25rem + 1.25vw, 1.875rem)', { lineHeight: '1.25' }],
      '4xl': ['clamp(1.875rem, 1.5rem + 1.875vw, 2.25rem)', { lineHeight: '1.25' }],
    },
    extend: {
      /* Gutter widths for grid */
      gap: {
        'gutter': 'var(--gutter-rem, 0.75rem)',
      },
      padding: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-r': 'env(safe-area-inset-right)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
      },
      minWidth: {
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
      },
      colors: {
        /* Map to your CSS vars if using Tailwind + existing theme */
        background: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
      },
    },
  },
  plugins: [],
};
