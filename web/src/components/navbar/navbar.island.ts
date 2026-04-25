class Navbar extends HTMLElement {
  private isOpen: boolean = false;
  private hasHero: boolean = false;
  private isScrolled: boolean = false;
  private header: HTMLElement | null = null;
  private mobileMenu: HTMLElement | null = null;
  private toggles: NodeListOf<HTMLElement> | null = null;
  private triggerButton: HTMLElement | null = null;

  private focusableElements: HTMLElement[] = [];
  private mediaQuery: MediaQueryList | null = null;

  private handleToggleBound = this.toggleMenu.bind(this);
  private handleScrollBound = this.handleScroll.bind(this);
  private handleKeydownBound = this.handleKeydown.bind(this);
  private handleResizeBound = this.handleResize.bind(this);

  connectedCallback() {
    this.header = this.querySelector('[data-header]');
    this.mobileMenu = this.querySelector('[data-mobile-menu]');
    this.toggles = this.querySelectorAll('[data-menu-toggle]');
    this.hasHero = this.getAttribute('data-has-hero') === 'true';

    if (this.mobileMenu) {
      this.mobileMenu.setAttribute('inert', '');
    }

    this.toggles.forEach((btn) => btn.addEventListener('click', this.handleToggleBound));
    document.addEventListener('keydown', this.handleKeydownBound);

    if (this.hasHero) {
      window.addEventListener('scroll', this.handleScrollBound, { passive: true });
      this.handleScroll();
    }

    this.mediaQuery = window.matchMedia('(min-width: 768px)');
    this.mediaQuery.addEventListener('change', this.handleResizeBound);
  }

  disconnectedCallback() {
    if (this.isOpen) {
      document.body.style.overflow = '';
    }

    if (this.hasHero) {
      window.removeEventListener('scroll', this.handleScrollBound);
    }

    this.toggles?.forEach((btn) => btn.removeEventListener('click', this.handleToggleBound));
    document.removeEventListener('keydown', this.handleKeydownBound);
    this.mediaQuery?.removeEventListener('change', this.handleResizeBound);
  }

  private handleResize(e: MediaQueryListEvent) {
    if (e.matches && this.isOpen) {
      this.toggleMenu();
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (!this.isOpen || !this.mobileMenu) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMenu();
      return;
    }

    if (e.key === 'Tab') {
      if (this.focusableElements.length === 0) {
        return;
      }

      const firstElement = this.focusableElements[0];
      const lastElement = this.focusableElements[this.focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  private toggleMenu() {
    this.isOpen = !this.isOpen;
    const state = this.isOpen ? 'open' : 'closed';

    this.setAttribute('data-state', state);
    document.body.style.overflow = this.isOpen ? 'hidden' : '';

    if (this.mobileMenu) {
      this.mobileMenu.setAttribute('data-state', state);

      if (this.isOpen) {
        if (document.activeElement instanceof HTMLElement) {
          this.triggerButton = document.activeElement;
        }

        this.mobileMenu.removeAttribute('inert');

        this.focusableElements = [
          ...this.mobileMenu.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ];

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (this.focusableElements.length > 0) {
              this.focusableElements[0].focus();
            }
          });
        });
      } else {
        this.mobileMenu.setAttribute('inert', '');
        this.focusableElements = [];

        if (this.triggerButton) {
          this.triggerButton.focus();
          this.triggerButton = null;
        }
      }
    }

    this.toggles?.forEach((btn) => {
      btn.setAttribute('aria-expanded', String(this.isOpen));
    });
  }

  private handleScroll() {
    if (!this.header) {
      return;
    }

    const shouldBeScrolled = window.scrollY > 0;
    if (shouldBeScrolled !== this.isScrolled) {
      this.isScrolled = shouldBeScrolled;

      requestAnimationFrame(() => {
        if (this.isScrolled) {
          this.header?.classList.remove('border-b-transparent');
        } else {
          this.header?.classList.add('border-b-transparent');
        }
      });
    }
  }
}

if (!customElements.get('wpm-navbar')) {
  customElements.define('wpm-navbar', Navbar);
}
