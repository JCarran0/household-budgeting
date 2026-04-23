import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts so the PWA plugin + service-worker assets
// don't load into the test runtime. Keeping this minimal — mirror the
// moduleResolution rules the app build uses by relying on Vite defaults.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Fail fast in CI / pre-commit. Locally, `npm run test:watch` overrides.
    reporters: ['default'],
    css: false,
  },
});
