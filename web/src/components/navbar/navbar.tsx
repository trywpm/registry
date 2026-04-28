import { cn } from '@/lib/utils';
import { Search } from '@/components/icon';
import { Island } from '@/components/island';
import { Button } from '@/components/button';
import { Separator } from '@/components/separator';
import { ThemeToggle } from '@/components/theme-toggle';

const navLinks = [
  { href: '/docs', label: 'Docs' },
  { href: '/themes', label: 'Themes' },
  { href: '/plugins', label: 'Plugins' },
  { href: 'https://github.com/orgs/trywpm/discussions', label: 'Support' },
];

export function Logo() {
  return (
    <a href="/" aria-label="wpm home" className="flex items-center size-5">
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="93.69 80.54 196.96 222.81"
      >
        <path
          fill="currentColor"
          d="M279.37 190.83h-33.78a11.26 11.26 0 0 0-11.25 11.26v33.78c0 .2.05.39.06.59l-29.37 29.37h-16.3l-20.56-20.56c.33-1.23.55-2.5.55-3.84V196.4c0-1.34-.23-2.61-.55-3.84l11.23-11.23.59.05h33.77c6.21 0 11.26-5.05 11.26-11.25v-33.78c0-6.21-5.05-11.26-11.26-11.26h-33.77c-.2 0-.39.04-.59.06l-17.69-17.69V88.04c0-4.14-3.36-7.5-7.5-7.5h-22.52c-4.14 0-7.5 3.36-7.5 7.5v22.52c0 4.14 3.36 7.5 7.5 7.5h19.41l17.69 17.7c-.01.2-.06.39-.06.59v33.78c0 .2.05.39.06.59l-11.23 11.22c-1.23-.33-2.5-.56-3.84-.56h-45.03c-8.3 0-15.01 6.72-15.01 15.01v45.03a15.01 15.01 0 0 0 15.01 15.02h45.03c1.34 0 2.61-.23 3.84-.55l20.56 20.55v19.41c0 4.14 3.36 7.5 7.5 7.5h22.52c4.14 0 7.5-3.36 7.5-7.5v-19.41l29.38-29.38c.2.01.39.05.59.05h33.78c6.21 0 11.26-5.04 11.26-11.26v-33.78c0-6.21-5.05-11.25-11.26-11.25z"
        />
      </svg>
    </a>
  );
}

function DesktopNav() {
  return (
    <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-0.5">
      {navLinks.map(({ href, label }) => (
        <Button key={href} variant="ghost" asChild size="sm">
          <a href={href}>{label}</a>
        </Button>
      ))}
    </nav>
  );
}

function CTAButtons({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      className={cn(
        'md:gap-2 gap-3',
        mobile ? 'flex flex-col py-3' : 'ml-auto hidden md:flex items-center',
      )}
    >
      {mobile ? (
        <>
          <Button asChild size="sm" className="w-full h-7.75">
            <a href="/signup">Sign Up</a>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full h-7.75">
            <a href="/login">Log In</a>
          </Button>
        </>
      ) : (
        <>
          <Button asChild variant="outline" size="sm" className="h-7.75">
            <a href="/login">Log In</a>
          </Button>
          <Button asChild size="sm" className="h-7.75">
            <a href="/signup">Sign Up</a>
          </Button>
        </>
      )}
    </div>
  );
}

function Hamburger() {
  return (
    <Button
      data-menu-toggle
      variant="ghost"
      size="icon"
      aria-expanded="false"
      aria-label="Toggle menu"
      className="md:hidden size-8"
    >
      <div className="relative h-4 w-4 flex flex-col justify-center items-center">
        <span className="absolute block h-0.5 w-4 bg-current transition-all duration-500 ease-in-out -translate-y-1 group-data-[state=open]/nav:rotate-45 group-data-[state=open]/nav:translate-y-0" />
        <span className="absolute block h-0.5 w-4 bg-current transition-all duration-500 ease-in-out translate-y-1 group-data-[state=open]/nav:-rotate-45 group-data-[state=open]/nav:translate-y-0" />
      </div>
    </Button>
  );
}

export function Navbar({ hasHero = false }: { hasHero?: boolean }) {
  return (
    <Island name="navbar">
      <wpm-navbar data-has-hero={hasHero ? 'true' : 'false'} className="group/nav">
        <header
          data-header
          className={cn(
            'sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b border-border/50 transition-colors duration-200',
            hasHero && 'border-b-transparent',
          )}
        >
          <div className="container flex h-(--header-height) items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo />
              <DesktopNav />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a href="/search" aria-label="Search">
                  <Search className="size-4.5" />
                </a>
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <ThemeToggle />
              <Separator orientation="vertical" className="h-6 hidden md:block" />
              <CTAButtons />
              <Separator orientation="vertical" className="h-6 md:hidden" />
              <Hamburger />
            </div>
          </div>
        </header>

        <div
          data-mobile-menu
          data-state="closed"
          className={cn(
            'invisible opacity-0 pointer-events-none',
            'fixed inset-0 z-60 bg-background md:hidden',
            'transition-opacity duration-300 ease-in-out',
            'data-[state=open]:visible data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto',
          )}
        >
          <div className="container flex items-center justify-end h-(--header-height)">
            <Hamburger />
          </div>

          <div className="container flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
            <CTAButtons mobile />

            <nav aria-label="Mobile Navigation" className="flex-1">
              {navLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center p-3 text-foreground hover:bg-muted rounded-lg transition-colors no-underline"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </wpm-navbar>
    </Island>
  );
}
