import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'sans-serif'],
        sans:   ['IBM Plex Sans Arabic', 'sans-serif'],
      },
      colors: {
        // Neutrals — main UI palette
        ink: {
          DEFAULT: '#0B1120',
          soft:    '#1E2A3B',
        },
        brand: {
          DEFAULT: '#005F2D',
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#005F2D',
          800: '#004422',
          900: '#002D17',
          950: '#001A0D',
        },
        lime: {
          DEFAULT: '#AECC1E',
          dark:    '#8AAA0F',
          light:   '#E8F5A3',
        },
      },
      fontSize: {
        'display':    ['clamp(2.5rem,6vw,4.5rem)', { lineHeight: '1.04', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-sm': ['clamp(1.75rem,4vw,2.75rem)', { lineHeight: '1.1',  letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline':   ['clamp(1.25rem,3vw,1.75rem)', { lineHeight: '1.3',  letterSpacing: '-0.01em',  fontWeight: '700' }],
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        'lifted':  '0 4px 12px rgba(0,0,0,0.08)',
        'high':    '0 8px 32px rgba(0,0,0,0.10)',
        'inset-t': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      animation: {
        'in':           'fadeIn 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'in-up':        'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'in-right':     'slideRight 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'ticker':       'ticker 28s linear infinite',
        'dot':          'dotPulse 2s ease-in-out infinite',
        'float':        'float 4s ease-in-out infinite',
        'glow-pulse':   'glowPulse 2.5s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'scan-line':    'scanLine 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },             to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight:{ from: { opacity: '0', transform: 'translateX(-16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        ticker:    { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        dotPulse:  { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        float:     { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 12px rgba(0,95,45,0.3)' },
          '50%':     { boxShadow: '0 0 28px rgba(0,95,45,0.6)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition: '200% center' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      transitionTimingFunction: {
        'expo-out': 'cubic-bezier(0.16,1,0.3,1)',
        'expo-in':  'cubic-bezier(0.7,0,0.84,0)',
      },
    },
  },
  plugins: [],
}

export default config
