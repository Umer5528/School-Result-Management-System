/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bcd0fd',
          300: '#8fb0fb',
          400: '#5c88f5',
          500: '#3b6fed',
          600: '#2f5cd6',
          700: '#264aab',
          800: '#1f3c87',
          900: '#1a3169',
        },
      },
      boxShadow: {
        glow: '0 8px 24px -8px rgba(47, 92, 214, 0.45)',
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(15, 23, 42, 0.08)',
        'card-hover': '0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 32px -8px rgba(15, 23, 42, 0.16)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        scaleIn: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #3b6fed 0%, #6d5cf5 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #eef4ff 0%, #f3f0ff 100%)',
      },
    },
  },
  plugins: [],
};
