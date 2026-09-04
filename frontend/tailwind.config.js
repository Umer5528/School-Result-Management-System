/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          500: '#3b6fed',
          600: '#2f5cd6',
          700: '#264aab',
        },
      },
    },
  },
  plugins: [],
};
