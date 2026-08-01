/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      colors: {
        white: '#fafafa',
        black: '#0a0a0a',
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--accent-light)',
          dark: 'var(--accent-muted)',
          muted: 'var(--accent-muted)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          light: 'var(--brand-light)',
          dark: 'var(--brand-muted)',
          muted: 'var(--brand-muted)',
        },
        ember: {
          DEFAULT: 'var(--danger)',
          light: 'var(--danger)',
          dark: 'var(--danger)',
        },
        moss: {
          DEFAULT: 'var(--success)',
          light: 'var(--success)',
          dark: 'var(--success)',
        },
        amber: {
          DEFAULT: 'var(--signal)',
          light: 'var(--signal)',
          dark: 'var(--signal)',
        },
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
      },
      boxShadow: {
        'diffuse': 'none',
        'diffuse-lg': 'none',
        'inner-glow': 'none',
      },
      animation: {
        'shimmer': 'subtle-pulse 2s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
