/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bbh: {
          green: '#00a96e',
          'green-dark': '#007f5d',
          'green-soft': '#e8f7f1',
          ink: '#1f2a24',
          muted: '#706350',
          line: '#dfe8e3',
          surface: '#f7fbf9',
          // Work-surface a shade deeper than card white, so white panels read as
          // elevated instead of blending into the page (depth via value, not colour).
          // A fresh, low-saturation mint (~5% sat) — same brand green family as the
          // rest of the palette, kept light so it reads clean, not the murky grey-green
          // of the earlier #eef3f1. Temperature matches the white cards floating on it.
          canvas: '#eff6f2',
        },
      },
      boxShadow: {
        'bbh-card': '0 22px 70px -36px rgba(0, 169, 110, 0.35)',
        // Soft ink-tinted elevation for panels/rows floating on bbh-canvas.
        // Two layers (contact + ambient) read as depth without a hard edge;
        // ink (#1f2a24) tint keeps shadows warm, never a cold grey.
        'bbh-sm': '0 1px 2px rgba(31, 42, 36, 0.04), 0 2px 6px -1px rgba(31, 42, 36, 0.06)',
        'bbh-md': '0 2px 6px -1px rgba(31, 42, 36, 0.07), 0 8px 22px -6px rgba(31, 42, 36, 0.10)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        beacon: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(0.85)', opacity: '0.55' },
        },
      },
      animation: {
        // ease-out-back-ish for a soft settle; `both` holds initial + final
        // state so staggered entrances stay hidden until their delay elapses.
        rise: 'rise 0.34s cubic-bezier(0.22, 1, 0.36, 1) both',
        beacon: 'beacon 2.4s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['Noto Sans Thai', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Noto Serif Thai', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
