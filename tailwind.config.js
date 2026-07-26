/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    // The scale is replaced rather than extended: an unedited Tailwind palette
    // is the single loudest tell of an unconsidered interface, and Atlas only
    // ever draws in paper, ink and one annotation blue.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#ffffff',
      black: '#000000',

      /** The page ground — drafting paper. Sits *below* the sheets on it. */
      paper: {
        DEFAULT: '#f4f3f1',
        deep: '#eceae7',
      },
      /** Panels resting on the ground. */
      sheet: {
        DEFAULT: '#ffffff',
        sunken: '#faf9f8',
      },
      /** Hairlines. `rule` for interior divisions, `edge` for outer borders. */
      rule: '#e6e4e0',
      edge: '#cecbc5',
      edgeStrong: '#b4b0a8',

      ink: {
        DEFAULT: '#121211',
        2: '#54524d',
        3: '#8a877f',
        4: '#a8a49c',
      },

      /** Annotation blue — the draughtsman's mark. Used rarely, never as fill decoration. */
      mark: {
        DEFAULT: '#1b4dff',
        deep: '#0f39cc',
        wash: '#eef1ff',
      },

      /** Semantic inks. These name a state; they are never a mood. */
      alert: { DEFAULT: '#b3261e', wash: '#fdf0ef' },
      pending: { DEFAULT: '#8a6a00', wash: '#fdf6e4' },
      done: { DEFAULT: '#2f6b4f', wash: '#eef6f1' },
    },
    fontFamily: {
      sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
      mono: ['"Spline Sans Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
    },
    extend: {
      fontSize: {
        // The edge register: condensed uppercase metadata, printed small.
        edge: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.13em' }],
        'edge-lg': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.11em' }],
        micro: ['0.75rem', { lineHeight: '1.125rem' }],
      },
      borderRadius: {
        // Drawn rectangles, not pills. 3px is the largest radius in the system.
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
        lg: '3px',
        xl: '4px',
        full: '9999px',
      },
      boxShadow: {
        // Depth is carried by rules and the paper/sheet value step. Shadows
        // appear only where something genuinely floats above the sheet.
        lift: '0 1px 1px rgba(18,18,17,.04), 0 4px 12px -6px rgba(18,18,17,.14)',
        panel: '0 1px 2px rgba(18,18,17,.05), 0 24px 48px -24px rgba(18,18,17,.30)',
        node: '0 1px 1px rgba(18,18,17,.05), 0 2px 6px -3px rgba(18,18,17,.12)',
      },
      spacing: {
        sidebar: '15rem',
      },
      keyframes: {
        'draw-in': {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'scaleY(1)' },
        },
        'ink-sweep': {
          from: { 'stroke-dashoffset': '1' },
          to: { 'stroke-dashoffset': '0' },
        },
        'ring-out': {
          '0%': { transform: 'scale(1)', opacity: '.5' },
          '80%': { transform: 'scale(2.4)', opacity: '0' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        shimmer: { to: { transform: 'translateX(100%)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'draw-in': 'draw-in .28s cubic-bezier(.16,1,.3,1) forwards',
        'ring-out': 'ring-out 2.6s cubic-bezier(.24,0,.38,1) infinite',
        shimmer: 'shimmer 1.5s infinite',
        spin: 'spin .9s linear infinite',
      },
      transitionTimingFunction: {
        // Exponential ease-out. The only curve the interface uses.
        draft: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
