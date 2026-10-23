import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      projects: [
        {
          test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
        },
        {
          plugins: [
            cloudflareTest({
              main: './worker/index.ts',
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'worker',
            include: ['tests/worker/**/*.test.ts'],
            setupFiles: ['./tests/worker/setup.ts'],
          },
        },
      ],
    },
  };
});
