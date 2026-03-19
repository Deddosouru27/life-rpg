/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: '#0a0a0f',
        surface: '#111118',
        'surface-2': '#16161f',
      },
      animation: {
        'xp-pulse': 'xp-pulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        'xp-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
      },
    },
  },
  plugins: [],
}
