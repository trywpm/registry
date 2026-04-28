import { html } from 'hono/html';

import type { Context } from 'hono';
import type { Child } from 'hono/jsx';

import { getAssetUrl } from '@/lib/utils';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

type LayoutProps = {
  c: Context;
  title: string;
  children: Child | Child[];
  hasHero?: boolean;
  homepage?: boolean;
  description: string;
  canonicalUrl: string;
  ogImage?: string;
  manifest?: {
    name: string;
    description?: string;
    version?: string;
    license?: string;
  };
  addCsrfToken?: boolean;
  loadVendorScripts?: {
    htmx?: boolean;
  };
};

export const BaseLayout = ({
  c,
  ogImage,
  children,
  manifest,
  description,
  canonicalUrl,
  title: originalTitle,
  hasHero = false,
  homepage = false,
  loadVendorScripts = {
    htmx: false,
  },
}: LayoutProps) => {
  const defaultOgImage = 'https://wpm.so/og.png';
  const finalOgImage = ogImage ?? defaultOgImage;

  // no-op to avoid unused variable error.
  // We might need `c` in the future for something like analytics or dynamic meta tags.
  c.get('');

  const ogImgAlt = originalTitle.replace(' - wpm', '');
  const title = homepage ? originalTitle : `${originalTitle} - wpm`;

  return (
    <>
      {html`<!DOCTYPE html>`}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />

          <script
            dangerouslySetInnerHTML={{
              __html: `
                const getTheme=()=>"undefined" !== typeof localStorage&&localStorage.getItem("theme")?localStorage.getItem("theme"):window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";"dark"===getTheme()?document.documentElement.classList.add("dark"):document.documentElement.classList.remove("dark");
              `,
            }}
          />

          {/* Preloads */}
          <link rel="preload" href={getAssetUrl('/src/assets/css/style.css')} as="style" />
          <link
            rel="preload"
            href="/fonts/sora-semibold.woff2"
            as="font"
            type="font/woff2"
            crossorigin="anonymous"
          />
          <link
            rel="preload"
            href="/fonts/dm-sans-regular.woff2"
            as="font"
            type="font/woff2"
            crossorigin="anonymous"
          />

          {import.meta.env.DEV && <script type="module" src="/@vite/client"></script>}

          {/* Basic Meta */}
          <title>{title}</title>
          <link rel="canonical" href={canonicalUrl} />
          <meta name="description" content={description} />

          {/* OpenGraph */}
          <meta property="og:title" content={title} />
          <meta property="og:type" content="website" />
          <meta property="og:image" content={finalOgImage} />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:image:url" content={finalOgImage} />
          <meta property="og:image:alt" content={ogImgAlt} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:description" content={description} />
          <meta property="og:locale" content="en_US" />
          <meta property="og:site_name" content="wpm" />

          {/* Twitter */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:site" content="@trywpm" />
          <meta name="twitter:creator" content="@thelovekesh" />
          <meta name="twitter:title" content={title} />
          <meta name="twitter:description" content={description} />
          <meta name="twitter:image" content={finalOgImage} />
          <meta name="twitter:image:alt" content={ogImgAlt} />

          {/* Links & Theme Colors */}
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
          <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />

          {/* Stylesheets & Vendor Scripts */}
          <link rel="stylesheet" href={getAssetUrl('/src/assets/css/style.css')} />

          {loadVendorScripts.htmx && (
            <script type="module" src={getAssetUrl('/src/assets/js/htmx.ts')}></script>
          )}

          {/* JSON-LD Schemas */}
          {homepage && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@id': 'https://wpm.so/#website',
                  '@type': 'WebSite',
                  name: 'wpm',
                  url: 'https://wpm.so/',
                  description:
                    'Discover, install, and manage WordPress packages like never before.',
                  publisher: {
                    '@type': 'Organization',
                    name: 'wpm',
                    url: 'https://wpm.so/',
                    logo: {
                      '@type': 'ImageObject',
                      url: 'https://wpm.so/favicon.svg',
                    },
                  },
                  sameAs: ['https://twitter.com/trywpm'],
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: 'https://wpm.so/search?q={search_term_string}',
                    'query-input': 'required name=search_term_string',
                  },
                }),
              }}
            />
          )}

          {manifest && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@id': `${canonicalUrl}#software`,
                  '@type': 'SoftwareApplication',
                  name: manifest.name,
                  applicationCategory: 'DeveloperApplication',
                  operatingSystem: 'Any',
                  url: canonicalUrl,
                  description: manifest.description ?? description,
                  softwareVersion: manifest.version,
                  license: manifest.license ?? 'UNLICENSED',
                  image: finalOgImage,
                  isAccessibleForFree: true,
                  publisher: {
                    '@type': 'Organization',
                    name: 'wpm',
                    url: 'https://wpm.so/',
                  },
                  isPartOf: {
                    '@id': 'https://wpm.so/#website',
                  },
                }),
              }}
            />
          )}

          {!homepage && !manifest && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@id': `${canonicalUrl}#webpage`,
                  '@type': 'WebPage',
                  name: title,
                  url: canonicalUrl,
                  description,
                  isPartOf: {
                    '@type': 'WebSite',
                    name: 'wpm',
                    url: 'https://wpm.so/',
                    '@id': 'https://wpm.so/#website',
                  },
                }),
              }}
            />
          )}
        </head>
        <body class="antialiased [--header-height:--spacing(14)]">
          <div class="flex flex-col min-h-screen">
            <Navbar hasHero={hasHero} />
            {children}
            <Footer hasHero={hasHero} />
          </div>
        </body>
      </html>
    </>
  );
};
