/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces. Tokens flip with the theme class on <html>.
        ink: {
          900: 'hsl(var(--ink-900) / <alpha-value>)',
          800: 'hsl(var(--ink-800) / <alpha-value>)',
          700: 'hsl(var(--ink-700) / <alpha-value>)',
          600: 'hsl(var(--ink-600) / <alpha-value>)',
        },
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        line: 'hsl(var(--border) / <alpha-value>)',
        'line-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        'fg-muted': 'hsl(var(--muted-foreground) / <alpha-value>)',
        'fg-subtle': 'hsl(var(--subtle-foreground) / <alpha-value>)',

        // Warm brand family.
        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          shade: 'hsl(var(--brand-shade) / <alpha-value>)',
          tint: 'hsl(var(--brand-tint) / <alpha-value>)',
        },

        // Accents. Bright tokens are for fills, *-text tokens for type.
        gold: {
          DEFAULT: 'hsl(var(--gold) / <alpha-value>)',
          soft: 'hsl(var(--gold-soft) / <alpha-value>)',
          text: 'hsl(var(--gold-text) / <alpha-value>)',
        },
        arcane: {
          DEFAULT: 'hsl(var(--arcane) / <alpha-value>)',
          soft: 'hsl(var(--arcane-soft) / <alpha-value>)',
          text: 'hsl(var(--arcane-text) / <alpha-value>)',
        },
        rune: {
          DEFAULT: 'hsl(var(--rune) / <alpha-value>)',
          text: 'hsl(var(--rune-text) / <alpha-value>)',
        },
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Poppins',
          '"Segoe UI Variable Display"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        card: 'var(--shadow-1)',
        raised: 'var(--shadow-2)',
        glow: '0 0 0 1px hsl(var(--gold) / 0.25), 0 14px 34px -22px hsl(var(--gold) / 0.5)',
        arcane:
          '0 0 0 1px hsl(var(--arcane) / 0.25), 0 14px 34px -22px hsl(var(--arcane) / 0.45)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        shake: 'shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
      },
    },
  },
  plugins: [],
};
