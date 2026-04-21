import type { Context } from 'hono';
import { BaseLayout } from '@/views/layouts/base';
import { buttonVariants } from '@/components/ui/button';
import { TestimonialCarousel } from '@/components/testimonial-carousel';
import { Hero, HeroActions, HeroHeading, HeroDescription } from '@/components/hero';
import { FeatureOps, FeatureCLI, FeatureRegistry } from '@/components/home-features';
import { InstallCommandCta, getOSFromUserAgent } from '@/components/install-command-cta';

const stats = [
  { label: 'Plugins', value: '37K+' },
  { label: 'Themes', value: '13K+' },
  { label: 'Artifacts', value: '1M+' },
  { label: 'Weekly Downloads', value: '11K+' },
];

export const HomePage = (c: Context) => {
  const canonicalUrl = 'https://wpm.so/';

  const userAgent = c.req.header('user-agent');
  const os = getOSFromUserAgent(userAgent);

  return (
    <BaseLayout
      c={c}
      hasHero
      homepage
      canonicalUrl={canonicalUrl}
      title="wpm - Modern package management for WordPress"
      description="Discover, install, and manage WordPress packages like never before."
    >
      <Hero grid>
        <HeroHeading>Modern Package Management for WordPress</HeroHeading>
        <HeroDescription>
          The central registry and package manager for WordPress developers.
        </HeroDescription>
        <HeroActions>
          <InstallCommandCta defaultOS={os} />
        </HeroActions>
      </Hero>

      <section class="mb-8 py-8 overflow-hidden border-b border-border/50">
        <div class="container">
          <div class="grid grid-cols-2 gap-y-6 gap-x-4 md:grid-cols-4 md:gap-x-0">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                class={`flex flex-col items-center gap-1 ${
                  index < stats.length - 1 ? 'md:border-r md:border-border' : ''
                }`}
              >
                <span class="text-2xl font-bold text-primary tracking-tight sm:text-4xl">
                  {stat.value}
                </span>
                <span class="text-sm text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section class="mb-16">
        <div class="container">
          <h2 class="leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] xl:text-5xl xl:tracking-tighter text-foreground text-center mx-auto">
            Fast Package Manager
          </h2>
          <p class="max-w-2xl text-center text-lg text-muted-foreground mx-auto">
            Powered by Go for speed, reliability, and scalable performance.
          </p>

          <FeatureCLI className="mt-6" />
        </div>
      </section>

      <section class="mb-16">
        <div class="container">
          <h2 class="leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] xl:text-5xl xl:tracking-tighter text-foreground text-center mx-auto">
            Modern Package Registry
          </h2>
          <p class="max-w-2xl text-center text-lg text-muted-foreground mx-auto">
            Discover, publish, and install WordPress plugin and themes with ease.
          </p>
          <FeatureRegistry className="mt-6" />
        </div>
      </section>

      <section class="mb-8">
        <div class="container">
          <h2 class="leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] xl:text-5xl xl:tracking-tighter text-foreground text-center mx-auto">
            Centralized and Secure Ops
          </h2>
          <p class="max-w-2xl text-center text-lg text-muted-foreground mx-auto">
            Publish and manage your private packages with confidence and security.
          </p>

          <FeatureOps className="mt-6" />
        </div>
      </section>

      <TestimonialCarousel />

      <Hero grid preFooter>
        <HeroHeading level={2} className="text-foreground">
          Start building with wpm
        </HeroHeading>
        <HeroDescription className="text-muted-foreground">
          Experience a workflow that keeps pace with your mind.
        </HeroDescription>
        <HeroActions>
          <a href="/waitlist" class={buttonVariants({ size: 'lg' })}>
            Join Waitlist
          </a>
          <a
            href="mailto:contact@wpm.com"
            class={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            Contact Us
          </a>
        </HeroActions>
      </Hero>
    </BaseLayout>
  );
};
