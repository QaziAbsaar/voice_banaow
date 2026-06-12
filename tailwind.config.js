/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0a0a0f',
          card: '#111118',
          input: '#1a1a24',
          border: '#2a2a3a',
          accent: '#7c3aed',
          'accent-hover': '#6d28d9',
          text: '#f0f0f5',
          'text-secondary': '#8888aa',
          success: '#10b981',
          error: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
