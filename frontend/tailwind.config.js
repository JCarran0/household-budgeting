/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme base colors
        'bg': {
          'primary': '#1a1a1a',
          'secondary': '#2d2d2d',
          'elevated': '#404040',
        },
        'border': '#4a4a4a',
        'text': {
          'primary': '#ffffff',
          'secondary': '#e5e5e5',
          'muted': '#a0a0a0',
        },
        // Pastel accent colors
        'pastel-yellow': '#fde68a',
        'pastel-yellow-light': '#fef3c7',
        'pastel-yellow-dark': '#fbbf24',
        'pastel-blue': '#93c5fd',
        'pastel-blue-light': '#dbeafe',
        'pastel-blue-dark': '#60a5fa',
        'pastel-pink': '#f9a8d4',
        'pastel-pink-light': '#fce7f3',
        'pastel-pink-dark': '#f472b6',
      },
    },
  },
  plugins: [],
}