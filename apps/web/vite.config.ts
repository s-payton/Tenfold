import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo name>/.
export default defineConfig({
  base: '/tenfold/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
