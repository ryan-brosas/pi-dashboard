/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      colors: {
        white: '#fafafa',
        black: '#0a0a0a',
        zinc: {
          50: '#f7f7f7',
          100: '#ededed',
          200: '#e0e0e0',
          300: '#c7c7c7',
          400: '#a1a1a1',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        slate: {
          50: '#f7f7f7',
          100: '#ededed',
          200: '#e0e0e0',
          300: '#c7c7c7',
          400: '#a1a1a1',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
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
          DEFAULT: 'var(--chart-danger)',
          light: 'var(--chart-danger)',
          dark: 'var(--chart-danger)',
        },
        moss: {
          DEFAULT: 'var(--chart-positive)',
          light: 'var(--chart-positive)',
          dark: 'var(--chart-positive)',
        },
        amber: {
          DEFAULT: 'var(--signal)',
          light: 'var(--signal)',
          dark: 'var(--signal)',
        },
      },
      borderRadius: {
        '2xl': '0.75rem',
        '3xl': '1rem',
        '4xl': '1.25rem',
        '5xl': '1.5rem',
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
