import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo name>/, and the path is case-sensitive.
export default defineConfig({
  base: '/Tenfold/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
