import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/scratch/**',
        'src/data/**',
        '**/*.test.js',
        'dashboard/**',
        'public-react/**',
        'cloudflare-worker/**',
        'coverage/**',
      ],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
