import { cn } from '@/lib/utils';
import { GitHubIcon, WordPressIcon, XIcon } from '@/components/icon';

const legalLinks = [
  { name: 'Terms', href: '/terms' },
  { name: 'Privacy', href: '/privacy' },
  {
    name: 'Status',
    href: 'https://wpm.statuspage.io/',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
];

const socialLinks = [
  {
    name: 'GitHub',
    href: 'https://github.com/trywpm',
    icon: GitHubIcon,
  },
  {
    name: 'X',
    href: 'https://x.com/trywpm',
    icon: XIcon,
  },
  {
    name: 'WordPress',
    href: 'https://profiles.wordpress.org/trywpm/',
    icon: WordPressIcon,
  },
];

export function Footer({ hasHero = false }: { hasHero?: boolean }) {
  return (
    <footer
      className={cn(
        'bg-background',
        'border-t border-border/50',
        hasHero && 'border-t-transparent',
      )}
    >
      <div className="container">
        <div className="py-8">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0 gap-2">
            {/* Legal Links */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2">
              {legalLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  target={link.target}
                  rel={link.rel}
                >
                  {link.name}
                </a>
              ))}
            </div>

            {/* Social Links - Appears before theme switcher on mobile, after on desktop */}
            <div className="flex items-center space-x-2 order-2 md:order-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-muted rounded-md"
                    aria-label={social.name}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>

            {/* Theme Switcher */}
            <div className="order-3 md:order-2 text-sm text-muted-foreground">
              Built with ❤️ for WordPress
            </div>
          </div>

          {/* Legal Text */}
          <div className="border-t border-border/40 mt-6 pt-6">
            <div className="text-center">
              <p className="text-muted-foreground text-xs leading-relaxed">
                © {new Date().getFullYear()} wpm. All rights reserved.
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> · </span>
                WordPress is a registered trademark of WordPress Foundation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
