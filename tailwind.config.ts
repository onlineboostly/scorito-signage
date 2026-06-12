import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bisharp: {
          dark: '#141413',
          light: '#faf9f5',
          orange: '#d97757',
          blue: '#6a9bcc',
          green: '#788c5d',
        },
        // movement-down red, tuned to sit well next to the brand palette
        negative: '#cf6e6e',
      },
      fontFamily: {
        heading: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        body: ['var(--font-lora)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
