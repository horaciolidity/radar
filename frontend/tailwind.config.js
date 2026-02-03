/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#0a0a0a',
        'brand-gray': '#1a1a1a',
        'brand-accent': '#00ff94', // Cyberpunk green
        'brand-danger': '#ff3333',
        'brand-warning': '#ffaa00',
        'brand-safe': '#00cc66',
      },
    },
  },
  plugins: [],
}
