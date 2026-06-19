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
        },
      },
      boxShadow: {
        'bbh-card': '0 22px 70px -36px rgba(0, 169, 110, 0.35)',
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
