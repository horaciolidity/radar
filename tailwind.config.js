/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#050505',
        surface: '#0f0f12',
        'surface-lighter': '#1a1a20',
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        accent: '#c084fc',
        success: '#10b981',
        warning: '#fbbf24',
        danger: '#f43f5e',
        scam: '#7f1d1d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 20px -5px rgba(59, 130, 246, 0.5)',
        'glow-success': '0 0 20px -5px rgba(16, 185, 129, 0.5)',
        'glow-danger': '0 0 20px -5px rgba(244, 63, 94, 0.5)',
      }
    },
  },
  plugins: [],
}
