import { z } from 'astro/zod';
import { env } from 'cloudflare:workers';
import { defineAction } from 'astro:actions';

export const server = {
  submitWaitlist: defineAction({
    input: z.object({
      email: z.email(),
    }),
    async handler(input) {
      await env.readme.put(`e/${input.email}`, null);
      return { success: true };
    },
  }),
};
