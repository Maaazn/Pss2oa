/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ps2: {
          bg: '#0a0b10',
          panel: '#12131c',
          panel2: '#171826',
          border: '#25273a',
          accent: '#2e9bd6',
          accent2: '#1ed7ff',
          psblue: '#0070d1',
          gold: '#e6b54a',
          green: '#4ade80',
          red: '#ef4444',
          muted: '#8b8fa3',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
