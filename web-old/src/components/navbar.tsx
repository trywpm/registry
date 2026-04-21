import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/docs', label: 'Docs' },
  {
    href: '/themes',
    label: 'Themes',
  },
  {
    href: '/plugins',
    label: 'Plugins',
  },
  { href: 'https://github.com/orgs/trywpm/discussions', label: 'Support' },
];

export function Logo() {
  return (
    <a href="/" className="flex items-center size-5">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="93.69 80.54 196.96 222.81">
        <path
          fill="currentColor"
          d="M279.37 190.83h-33.78a11.26 11.26 0 0 0-11.25 11.26v33.78c0 .2.05.39.06.59l-29.37 29.37h-16.3l-20.56-20.56c.33-1.23.55-2.5.55-3.84V196.4c0-1.34-.23-2.61-.55-3.84l11.23-11.23.59.05h33.77c6.21 0 11.26-5.05 11.26-11.25v-33.78c0-6.21-5.05-11.26-11.26-11.26h-33.77c-.2 0-.39.04-.59.06l-17.69-17.69V88.04c0-4.14-3.36-7.5-7.5-7.5h-22.52c-4.14 0-7.5 3.36-7.5 7.5v22.52c0 4.14 3.36 7.5 7.5 7.5h19.41l17.69 17.7c-.01.2-.06.39-.06.59v33.78c0 .2.05.39.06.59l-11.23 11.22c-1.23-.33-2.5-.56-3.84-.56h-45.03c-8.3 0-15.01 6.72-15.01 15.01v45.03a15.01 15.01 0 0 0 15.01 15.02h45.03c1.34 0 2.61-.23 3.84-.55l20.56 20.55v19.41c0 4.14 3.36 7.5 7.5 7.5h22.52c4.14 0 7.5-3.36 7.5-7.5v-19.41l29.38-29.38c.2.01.39.05.59.05h33.78c6.21 0 11.26-5.04 11.26-11.26v-33.78c0-6.21-5.05-11.25-11.26-11.25z"
        />
      </svg>
      <span className="sr-only">wpm</span>
    </a>
  );
}

function DesktopNav() {
  return (
    <nav className="hidden md:flex items-center gap-0.5">
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
    <div className={`gap-3 ${mobile ? 'py-6 space-y-3' : 'ml-auto hidden md:flex items-center'}`}>
      {/* <Button variant="outline" asChild size="sm" className={mobile ? 'w-full' : ''}>
        <a href="/login">Login</a>
      </Button> */}
      <Button asChild size="sm" className={mobile ? 'w-full' : ''}>
        <a href="/waitlist">Get Early Access</a>
      </Button>
    </div>
  );
}

function Hamburger({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="cursor-pointer md:hidden" onClick={toggle}>
      <div className="relative h-4 w-4 flex flex-col justify-center items-center">
        <span
          className={`absolute block h-0.5 w-4 bg-current transition-all duration-500 ease-in-out ${
            isOpen ? 'rotate-45 translate-y-0' : '-translate-y-1'
          }`}
        />
        <span
          className={`absolute block h-0.5 w-4 bg-current transition-all duration-500 ease-in-out ${
            isOpen ? '-rotate-45 translate-y-0' : 'translate-y-1'
          }`}
        />
      </div>
      <span className="sr-only">Toggle menu</span>
    </Button>
  );
}

export function Navbar({ hasHero = false }: { hasHero?: boolean }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60',
          'border-b border-border/50',
          hasHero && !isScrolled && 'border-b-transparent',
        )}
      >
        <div className="container flex h-(--header-height) items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <DesktopNav />
          </div>
          <CTAButtons />
          <Hamburger isOpen={isOpen} toggle={() => setIsOpen(!isOpen)} />
        </div>
      </header>

      {/* Mobile menu */}
      {isOpen && (
        <div className="fixed inset-0 z-60 bg-white dark:bg-black md:hidden animate-fadeIn">
          <div className="flex items-center justify-between h-(--header-height) px-4">
            <Logo />
            <Hamburger isOpen={true} toggle={() => setIsOpen(false)} />
          </div>
          <div className="container flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
            <CTAButtons mobile />
            <div className="flex-1">
              {navLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center p-3 text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
            <Separator />
            {/* theme switcher */}
            <div className="flex items-center justify-center py-4">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
