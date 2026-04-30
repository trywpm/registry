import type { Context } from 'hono';

import { BaseLayout } from '@/layouts/base';
import { getCanonicalUrl } from '@/lib/utils';

import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Button } from '@/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card';

export const WaitlistPage = (c: Context) => {
  return c.html(
    <BaseLayout
      c={c}
      title="Join the Waitlist"
      description="Request early access to the wpm registry."
      canonicalUrl={getCanonicalUrl(c.req.url)}
    >
      <main class="flex grow items-center justify-center p-6 md:p-10">
        <div class="container flex w-full max-w-md">
          <div class="flex flex-col gap-6">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Join the Waitlist</CardTitle>
                <CardDescription className="text-muted-foreground text-balance">
                  Enter your email to request early access to the wpm registry.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form>
                  <div class="flex flex-col gap-6">
                    <div class="grid gap-3">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="happy@example.com" required />
                    </div>
                    <div class="flex flex-col gap-3">
                      <Button type="submit" className="w-full" id="join-waitlist">
                        Join Waitlist
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
            <div class="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
              By joining, you agree to our <a href="/terms">Terms of Service</a> and{' '}
              <a href="/privacy">Privacy Policy</a>.
            </div>
          </div>
        </div>
      </main>
    </BaseLayout>,
  );
};
