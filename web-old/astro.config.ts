import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://wpm.so',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react()],
  adapter: cloudflare({
    imageService: 'compile',
    sessionKVBindingName: 'session',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
