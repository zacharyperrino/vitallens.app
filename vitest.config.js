import { defineConfig } from 'vitest/config';

// Frontend unit tests run in jsdom so router / DOM helpers can be exercised
// without a browser. Vitest picks this file up before vite.config.js.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    clearMocks: true,
  },
});
