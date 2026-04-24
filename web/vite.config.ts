import { join, basename, resolve } from 'node:path';
import { glob, readFile } from 'node:fs/promises';

import type { Plugin } from 'vite-plus';
import { defineConfig } from 'vite-plus';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

const webComponents: Record<string, string> = {};
for await (const file of glob(join(__dirname, 'src/components/**/*.island.ts'))) {
  const name = basename(file, '.island.ts');
  if (`${name}.island.ts` !== basename(file)) {
    throw new Error(`File ${file} does not follow the naming convention of {name}.island.ts`);
  }

  webComponents[name] = file;
}

function injectClientManifest(mode: string): Plugin {
  const virtualModuleId = 'virtual:client-manifest';
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;

  let manifestPath: string = '';

  return {
    name: 'vite-plugin-wpm-inject-client-manifest',
    configResolved(config) {
      const clientOutDir = config.environments.client.build.outDir;
      manifestPath = resolve(config.root, clientOutDir, '.vite/manifest.json');
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let manifest: Record<string, unknown> = {};

        if (mode !== 'production') {
          manifest = {};
        } else {
          manifest = await readFile(manifestPath, 'utf-8').then(JSON.parse);
        }

        return `export default ${JSON.stringify(manifest)}`;
      }

      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), mode === 'test' ? undefined : cloudflare(), injectClientManifest(mode)],
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
  publicDir: 'src/public',
  server: {
    port: 3000,
    strictPort: true,
  },
  builder: {
    buildApp: async (builder) => {
      // Build client assets first, so we can get the
      // manifest and asset paths for the wpm_web worker.
      await builder.build(builder.environments.client);

      // `wpm_web` is coming from Cloudflare plugin.
      // Build wpm_web worker, which depends on the client manifest.
      await builder.build(builder.environments.wpm_web);
    },
  },
  environments: {
    client: {
      build: {
        outDir: 'dist/public',
        manifest: true,
        emptyOutDir: true,
        rolldownOptions: {
          input: {
            htmx: 'src/assets/js/htmx.ts',
            style: 'src/assets/css/style.css',
            ...webComponents,
          },
          output: {
            format: 'esm',
            entryFileNames: 'dist/[name]-[hash:12].js',
            chunkFileNames: 'dist/[name]-[hash:12].js',
            assetFileNames: 'dist/[name]-[hash:12].[ext]',
          },
        },
      },
    },
  },
  test: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
}));
