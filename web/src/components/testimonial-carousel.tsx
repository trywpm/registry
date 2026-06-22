type Testimonial = {
  id: number;
  content: string;
  author: {
    name: string;
    role: string;
    avatar: string;
  };
};

const testimonials: Testimonial[] = [
  {
    id: 1,
    content:
      'Managing commercial plugins via Composer has always felt like a hacky workaround. The security aspect alone—actually verifying signed payloads—makes wpm worth a look for serious agency work. Excited to try this out. 🛠️',
    author: {
      name: 'Mahesh C. Joshi',
      role: 'Founder & Visionary, Qreo Digital',
      avatar: '/images/testimonials/mahesh-c-joshi.jpeg',
    },
  },
  {
    id: 2,
    content:
      'Interesting idea. We already have partial solutions like Composer/WPackagist and Bedrock, but none feel native or secure enough for teams at scale. Curious how this would differentiate, especially around signing and commercial plugins.',
    author: {
      name: 'Asif Reza',
      role: 'Web Animation & WordPress expert (11+ years)',
      avatar: '/images/testimonials/asif-reza.jpeg',
    },
  },
  {
    id: 3,
    content:
      'Composer works, but it gets messy with paid plugins and private packages. wpm feels more secure and easier for teams when WordPress is part of real infrastructure.',
    author: {
      name: 'Prathusha Nammi',
      role: 'Web Application Developer',
      avatar: '/images/testimonials/prathusha-nammi.jpeg',
    },
  },
  {
    id: 4,
    content:
      'Dependency management and supply-chain security are still weak spots in the WordPress ecosystem, especially at scale. A signed, CLI-friendly package manager could be a huge step forward for agencies and production teams.',
    author: {
      name: 'MD Alamin',
      role: 'WordPress Designer',
      avatar: '/images/testimonials/md-alamin.jpeg',
    },
  },
  {
    id: 5,
    content:
      'Finally, a package manager that actually understands WordPress. Before this, downloading plugins or themes was a pain. Now I just use wpm install and the package is there instantly.',
    author: {
      name: 'Deepak Kumar',
      role: 'Senior Software Engineer',
      avatar: '/images/testimonials/deepak-kumar.jpeg',
    },
  },
];

export const TestimonialCarousel = () => {
  const cards = testimonials.map((t) => (
    <article key={t.id} class="w-100 shrink-0 pr-6">
      <div class="relative h-full rounded-2xl border border-b-0 border-border/60 bg-linear-to-b from-muted/20 to-transparent p-6">
        <blockquote class="mb-4 text-sm leading-relaxed relative z-10">"{t.content}"</blockquote>

        <div class="flex items-center gap-3 relative z-10">
          <div class="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-secondary/20">
            <img
              src={t.author.avatar}
              alt={t.author.name}
              class="h-full w-full object-cover"
              loading="lazy"
              width="40"
              height="40"
            />
          </div>
          <div>
            <p class="text-sm font-semibold">{t.author.name}</p>
            <p class="text-xs text-muted-foreground">{t.author.role}</p>
          </div>
        </div>

        <div class="pointer-events-none absolute -inset-x-px bottom-0 h-24 bg-linear-to-t from-background via-background/80 to-transparent z-0 rounded-b-2xl" />
      </div>
    </article>
  ));

  return (
    <>
      <section class="mt-8 py-8 overflow-hidden border-t border-border/50">
        <div class="relative group flex overflow-hidden mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div class="marquee-strip flex min-w-full shrink-0 animate-marquee">{cards}</div>
          <div class="marquee-strip flex min-w-full shrink-0 animate-marquee" aria-hidden="true">
            {cards}
          </div>
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes marquee {
              from {
                transform: translate3d(0, 0, 0);
              }
              to {
                transform: translate3d(-100%, 0, 0);
              }
            }

            .animate-marquee {
              animation: marquee 50s linear infinite;
              will-change: transform;
            }

            .group:hover .animate-marquee {
              cursor: grab;
              animation-play-state: paused;
            }
          `,
        }}
      />
    </>
  );
};
