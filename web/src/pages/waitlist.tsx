import type { Context } from 'hono';

import { z } from 'zod';
import { env } from 'cloudflare:workers';

import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';

import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Button } from '@/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card';

const emailSchema = z.email({ message: 'Please enter a valid email address.' });

const WaitlistForm = ({ email = '', error = '' }: { email?: string; error?: string }) => (
  <form id="waitlist-form" hx-post="" hx-swap="outerHTML">
    <div class="flex flex-col gap-6">
      <div class="grid gap-3">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="happy@example.com"
          value={email}
          required
        />
        {error && <p class="text-sm font-medium text-destructive">{error}</p>}
      </div>
      <div class="flex flex-col gap-3">
        <Button type="submit" className="w-full" id="join-waitlist">
          Join Waitlist
        </Button>
      </div>
    </div>
  </form>
);

const SuccessMessage = () => (
  <div
    id="waitlist-form"
    class="flex flex-col items-center justify-center text-center py-4 space-y-4"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-12 w-12 text-primary"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <div>
      <h3 class="text-lg font-semibold">You're on the list!</h3>
      <p class="text-sm text-muted-foreground mt-1">We'll notify you when early access is ready.</p>
    </div>
  </div>
);

export const WaitlistPage = async (c: Context) => {
  const isPost = c.req.method === 'POST';
  const isHtmxReq = c.req.header('hx-request') === 'true';

  if (isPost && isHtmxReq) {
    const body = await c.req.parseBody();
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    const v = emailSchema.safeParse(email);
    if (!v.success) {
      return c.html(<WaitlistForm email={email} error={v.error.issues[0].message} />);
    }

    try {
      await env.readme.put(`e/${email}`, null);
    } catch {
      return c.html(
        <WaitlistForm
          email={email}
          error="An error occurred while processing your request. Please try again later."
        />,
      );
    }

    return c.html(<SuccessMessage />);
  }

  return c.html(
    <BaseLayout
      c={c}
      title="Join the Waitlist"
      loadVendorScripts={{ htmx: true }}
      description="Request early access to the wpm registry."
      canonicalUrl={getCanonicalUrl(c.req.url)}
    >
      <main class="flex grow items-center justify-center p-6 md:p-10">
        <div class="container flex w-full max-w-md flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Join the Waitlist</CardTitle>
              <CardDescription className="text-muted-foreground text-balance">
                Enter your email to request early access to the wpm registry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaitlistForm />
            </CardContent>
          </Card>
          <div class="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
            By joining, you agree to our <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </div>
        </div>
      </main>
    </BaseLayout>,
  );
};
