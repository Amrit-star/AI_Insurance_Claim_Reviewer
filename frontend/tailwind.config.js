/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        'plum-blue': '#1e3a8a',
        'plum-light': '#eff6ff',
      }
    },
  },
  plugins: [],
}
